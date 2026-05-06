// Bun-native dev server that runs the same engine + room logic as the
// Cloudflare Worker. Used for local QA when workerd's miniflare loop is
// flaky on the dev machine. Identical wire protocol, so the browser client
// can't tell which is which.

import { produce } from "immer";

import { applyAction, RuleError, initialLobby } from "../../src/engine/reduce";
import { autoActionFor, onClockPlayerId } from "../../src/engine/autoAction";
import { projectStateForPlayer } from "../../src/engine/project";
import type { GameState, PlayerId } from "../../src/engine/state";
import type { ClientToServer, ServerToClient } from "./protocol";

type SessionInfo = {
  sessionId: string;
  playerId: PlayerId | null;
  recentActionIds: string[];
};

const RECENT_ACTIONS_PER_SESSION = 64;

class RoomState {
  game: GameState = initialLobby();
  sessions = new Map<string, SessionInfo>();
  sockets = new Map<string, any>(); // ServerWebSocket
  hostSessionId: string | null = null;
  code: string;
  // Mirrors the Cloudflare DO alarm state for parity in local QA. Uses a
  // setTimeout instead of the DO Alarms API.
  currentDeadlineMs: number | null = null;
  alarmTimer: ReturnType<typeof setTimeout> | null = null;
  constructor(code: string) {
    this.code = code;
  }
}

const rooms = new Map<string, RoomState>();

function generateRoomCode(): string {
  const alphabet = "BCDFGHJKLMNPQRSTVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 4; i++) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  // Avoid collisions with existing rooms.
  if (rooms.has(code)) return generateRoomCode();
  return code;
}

const PORT = Number(process.env.PORT ?? 8787);
// Dev-only state injection. Production CF Worker never has this — it's the
// reason `dev-server.ts` is excluded from `worker/tsconfig.json`'s `include`.
// Enable with `DEV_INJECT=1 bun run server:dev`. Used by scenario tests to
// engineer specific mid-game states deterministically.
const DEV_INJECT = process.env.DEV_INJECT === "1";

function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

const server = Bun.serve({
  port: PORT,
  async fetch(request, server) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders() });
    }

    if (url.pathname === "/api/rooms" && request.method === "POST") {
      const code = generateRoomCode();
      rooms.set(code, new RoomState(code));
      return Response.json({ code }, { headers: corsHeaders() });
    }

    // Dev-only state inspection / injection endpoints. Off unless DEV_INJECT=1.
    if (DEV_INJECT) {
      const inspectMatch = url.pathname.match(/^\/dev\/state\/([A-Z0-9]{4,8})$/);
      if (inspectMatch) {
        const code = inspectMatch[1]!;
        const room = rooms.get(code);
        if (!room) return new Response("no such room", { status: 404, headers: corsHeaders() });

        if (request.method === "GET") {
          return Response.json(
            { game: room.game, hostSessionId: room.hostSessionId },
            { headers: corsHeaders() },
          );
        }
        if (request.method === "PUT") {
          const body = (await request.json()) as { game?: GameState; hostSessionId?: string };
          if (body.game) room.game = body.game;
          if (body.hostSessionId !== undefined) room.hostSessionId = body.hostSessionId;
          // Re-broadcast so connected clients pick up the new state immediately.
          broadcast(room);
          return Response.json({ ok: true }, { headers: corsHeaders() });
        }
      }
    }

    const wsMatch = url.pathname.match(/^\/r\/([A-Z0-9]{4,8})\/ws$/);
    if (wsMatch) {
      const code = wsMatch[1]!;
      // Lazy-create the room (covers the case where /api/rooms wasn't hit).
      if (!rooms.has(code)) rooms.set(code, new RoomState(code));
      const upgraded = server.upgrade(request, { data: { code, sessionId: null } });
      if (upgraded) return undefined as unknown as Response;
      return new Response("upgrade failed", { status: 426, headers: corsHeaders() });
    }

    return new Response("not found", { status: 404, headers: corsHeaders() });
  },
  websocket: {
    open(_ws: any) {
      // Nothing — we wait for the join handshake to bind the session.
    },
    message(ws: any, message: string | Uint8Array) {
      const data: { code: string; sessionId: string | null } = (ws as any).data;
      const room = rooms.get(data.code);
      if (!room) return send(ws, { type: "error", message: "room not found" });

      let msg: ClientToServer;
      try {
        msg = JSON.parse(typeof message === "string" ? message : new TextDecoder().decode(message as Uint8Array));
      } catch {
        return send(ws, { type: "error", message: "invalid JSON" });
      }

      try {
        switch (msg.type) {
          case "join": {
            data.sessionId = msg.sessionId;
            let session = room.sessions.get(msg.sessionId);

            // Lazy-register: a player with this exact id already exists in
            // the game (post-inject reconnect, server reload, etc.).
            if (!session) {
              const existingPlayer = room.game.players.find((p) => p.id === msg.sessionId);
              if (existingPlayer) {
                session = {
                  sessionId: msg.sessionId,
                  playerId: msg.sessionId,
                  recentActionIds: [],
                };
                room.sessions.set(msg.sessionId, session);
                if (!room.hostSessionId) room.hostSessionId = msg.sessionId;
                room.game = produce(room.game, (draft) => {
                  const player = draft.players.find((p) => p.id === msg.sessionId);
                  if (player) player.connected = true;
                });
              }
            }

            // Reclaim-by-name: unknown sessionId but exactly one disconnected
            // player matches the display name. Mirrors the worker's logic so
            // local QA exercises the same code path. See worker/src/index.ts.
            if (!session) {
              const target = matchReclaimableSeat(room.game.players, msg.name);
              if (target) {
                const reclaimedPid = target.id;
                let seatWasHost = room.hostSessionId === reclaimedPid;
                for (const [sid, info] of Array.from(room.sessions)) {
                  if (info.playerId === reclaimedPid) {
                    if (room.hostSessionId === sid) seatWasHost = true;
                    room.sessions.delete(sid);
                    room.sockets.delete(sid);
                  }
                }
                session = {
                  sessionId: msg.sessionId,
                  playerId: reclaimedPid,
                  recentActionIds: [],
                };
                room.sessions.set(msg.sessionId, session);
                if (seatWasHost) room.hostSessionId = msg.sessionId;
                room.game = produce(room.game, (draft) => {
                  const player = draft.players.find((p) => p.id === reclaimedPid);
                  if (player) player.connected = true;
                });
              }
            }

            if (!session) {
              if (room.game.phase !== "lobby") {
                return send(ws, { type: "error", message: "game already in progress" });
              }
              if (room.game.players.length >= 5) {
                return send(ws, { type: "error", message: "room full" });
              }
              const playerId = msg.sessionId;
              const name = msg.name.slice(0, 24) || "Player";
              room.game = produce(room.game, (draft) => {
                draft.players.push({
                  id: playerId,
                  name,
                  hand: [],
                  bank: [],
                  propertySets: [],
                  connected: true,
                });
              });
              if (!room.hostSessionId) room.hostSessionId = msg.sessionId;
              session = { sessionId: msg.sessionId, playerId, recentActionIds: [] };
              room.sessions.set(msg.sessionId, session);
            } else {
              const sessId = session!.playerId;
              room.game = produce(room.game, (draft) => {
                const player = draft.players.find((p) => p.id === sessId);
                if (player) player.connected = true;
              });
            }

            // Stash playerId on the connection's data so the close handler
            // can identify the seat even after reclaim drops the session
            // record this socket originally had.
            (data as any).playerId = session.playerId;

            // Kick any other socket holding this sessionId or the same seat.
            for (const [sid, other] of Array.from(room.sockets)) {
              if (other === ws) continue;
              const od = (other as any).data as { sessionId: string | null; playerId?: string };
              if (sid === msg.sessionId || od?.playerId === session.playerId) {
                try {
                  other.close(1000, "replaced");
                } catch {}
                room.sockets.delete(sid);
              }
            }
            room.sockets.set(msg.sessionId, ws);

            armOrClearAlarm(room);
            const isHost = room.hostSessionId === msg.sessionId;
            send(ws, {
              type: "joined",
              playerId: session.playerId!,
              isHost,
              roomCode: room.code,
            });
            broadcast(room);
            return;
          }
          case "leave": {
            if (data.sessionId) handleLeave(room, data.sessionId);
            return;
          }
          case "start": {
            if (!data.sessionId) return send(ws, { type: "error", message: "not joined" });
            if (data.sessionId !== room.hostSessionId) {
              return send(ws, { type: "error", message: "only host" });
            }
            const players = room.game.players.map((p) => ({ id: p.id, name: p.name }));
            room.game = applyAction(room.game, {
              type: "START_GAME",
              rngSeed: msg.rngSeed ?? (Date.now() & 0x7fffffff),
              players,
            });
            armOrClearAlarm(room);
            broadcast(room);
            return;
          }
          case "action": {
            const session = data.sessionId ? room.sessions.get(data.sessionId) : null;
            if (!session?.playerId) return send(ws, { type: "error", message: "not joined" });
            const action = msg.action;
            // Idempotent replay: if we've seen this clientActionId already,
            // re-send the latest state (so the reconnected client gets a
            // fresh snapshot) and skip applying.
            if (msg.clientActionId && session.recentActionIds.includes(msg.clientActionId)) {
              const projected = projectStateForPlayer(
                room.game,
                session.playerId,
                room.currentDeadlineMs ?? undefined,
              );
              send(ws, { type: "state", state: projected });
              return;
            }
            if ("playerId" in action && action.playerId !== session.playerId) {
              return send(ws, { type: "error", message: "playerId mismatch" });
            }
            if (action.type === "UPDATE_SETTINGS" && data.sessionId !== room.hostSessionId) {
              return send(ws, { type: "error", message: "only host can change settings" });
            }
            room.game = applyAction(room.game, action);
            if (msg.clientActionId) {
              session.recentActionIds.push(msg.clientActionId);
              if (session.recentActionIds.length > RECENT_ACTIONS_PER_SESSION) {
                session.recentActionIds.shift();
              }
            }
            armOrClearAlarm(room);
            broadcast(room);
            return;
          }
          case "ping": {
            send(ws, { type: "pong", t: msg.t });
            return;
          }
        }
      } catch (err) {
        const message = err instanceof RuleError ? err.message : "internal error";
        send(ws, { type: "error", message });
      }
    },
    close(ws: any) {
      const data: { code: string; sessionId: string | null; playerId?: string } =
        (ws as any).data;
      if (!data.sessionId) return;
      const room = rooms.get(data.code);
      if (!room) return;
      // Stale-close guard mirrors the worker: don't mark the seat
      // disconnected if a newer socket already owns this sessionId or has
      // reclaimed the seat (different sessionId, same playerId).
      const replaced = Array.from(room.sockets.values()).some((other) => {
        if (other === ws) return false;
        const od = (other as any).data as { sessionId: string | null; playerId?: string };
        if (!od) return false;
        if (od.sessionId === data.sessionId) return true;
        return data.playerId !== undefined && od.playerId === data.playerId;
      });
      if (replaced) return;

      if (room.sockets.get(data.sessionId) === ws) {
        room.sockets.delete(data.sessionId);
      }
      const playerId =
        data.playerId ?? room.sessions.get(data.sessionId)?.playerId;
      if (playerId) {
        room.game = produce(room.game, (draft) => {
          const player = draft.players.find((p) => p.id === playerId);
          if (player) player.connected = false;
        });
      }
      broadcast(room);
    },
  },
});

function handleLeave(room: RoomState, sessionId: string): void {
  if (room.game.phase === "lobby") {
    const session = room.sessions.get(sessionId);
    if (session?.playerId) {
      const leavingId = session.playerId;
      room.game = produce(room.game, (draft) => {
        draft.players = draft.players.filter((p) => p.id !== leavingId);
      });
      if (room.hostSessionId === sessionId) {
        room.hostSessionId =
          Array.from(room.sessions.keys()).find((s) => s !== sessionId) ?? null;
      }
    }
    room.sessions.delete(sessionId);
    room.sockets.delete(sessionId);
  } else {
    room.sockets.delete(sessionId);
    const session = room.sessions.get(sessionId);
    const playerId = session?.playerId;
    if (playerId) {
      room.game = produce(room.game, (draft) => {
        const player = draft.players.find((p) => p.id === playerId);
        if (player) player.connected = false;
      });
    }
  }
  broadcast(room);
}

function broadcast(room: RoomState): void {
  const deadline = room.currentDeadlineMs ?? undefined;
  for (const [sessionId, socket] of room.sockets) {
    const session = room.sessions.get(sessionId);
    if (!session?.playerId) continue;
    const projected = projectStateForPlayer(room.game, session.playerId, deadline);
    send(socket, { type: "state", state: projected });
  }
}

// Mirror of the Cloudflare DO alarm logic, but using setTimeout. Idempotent:
// each call re-arms based on current state; clears the timer when the game is
// not in progress or the timer is off.
function armOrClearAlarm(room: RoomState): void {
  const timerSec = room.game.settings?.turnTimerSeconds;
  const someoneOnClock = onClockPlayerId(room.game) !== null;
  if (!someoneOnClock || timerSec == null) {
    if (room.alarmTimer) {
      clearTimeout(room.alarmTimer);
      room.alarmTimer = null;
    }
    room.currentDeadlineMs = null;
    return;
  }
  const next = Date.now() + timerSec * 1000;
  room.currentDeadlineMs = next;
  if (room.alarmTimer) clearTimeout(room.alarmTimer);
  room.alarmTimer = setTimeout(() => fireAlarm(room), timerSec * 1000);
}

function fireAlarm(room: RoomState): void {
  if (room.currentDeadlineMs != null && Date.now() < room.currentDeadlineMs - 250) {
    // Re-arm to the latest deadline.
    if (room.alarmTimer) clearTimeout(room.alarmTimer);
    room.alarmTimer = setTimeout(() => fireAlarm(room), room.currentDeadlineMs - Date.now());
    return;
  }
  const auto = autoActionFor(room.game);
  if (auto) {
    try {
      room.game = applyAction(room.game, auto);
      room.game = produce(room.game, (draft) => {
        draft.log.push({
          at: draft.currentTurn,
          message: `Auto-action fired (timer expired).`,
        });
      });
    } catch {
      // Ignore — re-arm and try again next cycle.
    }
  }
  armOrClearAlarm(room);
  broadcast(room);
}

function send(socket: any, msg: ServerToClient): void {
  try {
    socket.send(JSON.stringify(msg));
  } catch {
    // ignore
  }
}

// Reclaim eligibility — see worker/src/index.ts for the canonical doc.
function matchReclaimableSeat(
  players: readonly { id: PlayerId; name: string; connected: boolean }[],
  name: string,
): { id: PlayerId; name: string; connected: boolean } | null {
  const needle = name.trim().toLowerCase();
  if (!needle) return null;
  let match: { id: PlayerId; name: string; connected: boolean } | null = null;
  for (const p of players) {
    if (p.connected) continue;
    if (p.name.trim().toLowerCase() !== needle) continue;
    if (match) return null;
    match = p;
  }
  return match;
}

console.log(`[dev-server] listening on http://localhost:${server.port}`);
