// Bun-native dev server that runs the same engine + room logic as the
// Cloudflare Worker. Used for local QA when workerd's miniflare loop is
// flaky on the dev machine. Identical wire protocol, so the browser client
// can't tell which is which.

import { produce } from "immer";

import { applyAction, RuleError, initialLobby } from "../../src/engine/reduce";
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
            const previous = room.sockets.get(msg.sessionId);
            if (previous && previous !== ws) {
              try {
                previous.close(1000, "replaced");
              } catch {}
            }
            room.sockets.set(msg.sessionId, ws);
            let session = room.sessions.get(msg.sessionId);
            // If we don't have a session record but the game already has a
            // player with this exact id, lazily register the session — covers
            // the post-inject reconnect path AND any session restored from
            // refresh after server reload.
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
            if (!session) {
              if (room.game.phase !== "lobby") {
                return send(ws, { type: "error", message: "game in progress" });
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
                  tableau: [],
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
              const projected = projectStateForPlayer(room.game, session.playerId);
              send(ws, { type: "state", state: projected });
              return;
            }
            if ("playerId" in action && action.playerId !== session.playerId) {
              return send(ws, { type: "error", message: "playerId mismatch" });
            }
            room.game = applyAction(room.game, action);
            if (msg.clientActionId) {
              session.recentActionIds.push(msg.clientActionId);
              if (session.recentActionIds.length > RECENT_ACTIONS_PER_SESSION) {
                session.recentActionIds.shift();
              }
            }
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
      const data: { code: string; sessionId: string | null } = (ws as any).data;
      if (!data.sessionId) return;
      const room = rooms.get(data.code);
      if (!room) return;
      // Only delete this socket if it's the same one we tracked (to handle
      // the replace-on-rejoin case cleanly).
      if (room.sockets.get(data.sessionId) === ws) {
        room.sockets.delete(data.sessionId);
        const session = room.sessions.get(data.sessionId);
        const playerId = session?.playerId;
        if (playerId) {
          room.game = produce(room.game, (draft) => {
            const player = draft.players.find((p) => p.id === playerId);
            if (player) player.connected = false;
          });
        }
        broadcast(room);
      }
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
  for (const [sessionId, socket] of room.sockets) {
    const session = room.sessions.get(sessionId);
    if (!session?.playerId) continue;
    const projected = projectStateForPlayer(room.game, session.playerId);
    send(socket, { type: "state", state: projected });
  }
}

function send(socket: any, msg: ServerToClient): void {
  try {
    socket.send(JSON.stringify(msg));
  } catch {
    // ignore
  }
}

console.log(`[dev-server] listening on http://localhost:${server.port}`);
