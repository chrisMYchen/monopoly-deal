/// <reference types="@cloudflare/workers-types" />

import { produce } from "immer";

import { applyAction, RuleError, initialLobby } from "../../src/engine/reduce";
import { autoActionFor, onClockPlayerId } from "../../src/engine/autoAction";
import { projectStateForPlayer } from "../../src/engine/project";
import type { GameState, PlayerId } from "../../src/engine/state";
import type { ClientToServer, ServerToClient } from "./protocol";

export interface Env {
  ROOM: DurableObjectNamespace;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // CORS for browser clients.
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders() });
    }

    // POST /api/rooms — create a new room, return its code.
    if (url.pathname === "/api/rooms" && request.method === "POST") {
      const code = generateRoomCode();
      // We don't pre-init the DO here — first WS connect lazily provisions it.
      return Response.json({ code }, { headers: corsHeaders() });
    }

    // GET /r/:code/ws — upgrade to WebSocket on the matching DO.
    const wsMatch = url.pathname.match(/^\/r\/([A-Z0-9]{4,8})\/ws$/);
    if (wsMatch) {
      const code = wsMatch[1]!;
      const id = env.ROOM.idFromName(code);
      const stub = env.ROOM.get(id);
      // Forward request including upgrade headers.
      return stub.fetch(request);
    }

    return new Response("not found", { status: 404, headers: corsHeaders() });
  },
};

function corsHeaders(): HeadersInit {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function generateRoomCode(): string {
  // 4-letter, no-vowel, unambiguous chars to avoid foul-word collisions.
  const alphabet = "BCDFGHJKLMNPQRSTVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 4; i++) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
}

// ---------------------------------------------------------------------------
// Room DurableObject
// ---------------------------------------------------------------------------

type SessionInfo = {
  sessionId: string;
  playerId: PlayerId | null;
  // Ring buffer of recently-applied clientActionIds. Lets us silently dedupe
  // action replays after a client reconnect.
  recentActionIds: string[];
};

const RECENT_ACTIONS_PER_SESSION = 64;

// Storage keys for game state persistence — survives DO eviction so a brief
// idle period can't wipe the room out from under players.
const STORAGE_KEY_GAME = "game";
const STORAGE_KEY_HOST = "host";
const STORAGE_KEY_CODE = "code";

export class Room {
  private state: DurableObjectState;
  private game: GameState = initialLobby();
  // sessionId -> session metadata (playerId etc.)
  private sessions = new Map<string, SessionInfo>();
  // Live sockets indexed by sessionId so we can deliver state and detect dupes.
  private sockets = new Map<string, WebSocket>();
  private hostSessionId: string | null = null;
  private roomCode: string | null = null;
  // Coalesce frequent storage writes: at most one write in flight at a time,
  // with the latest snapshot scheduled if a write lands during one.
  private pendingPersist = false;
  private persisting = false;
  // Server epoch ms by which the on-clock player must act, or null when no
  // clock is running. Mirrored into storage.setAlarm() so the DO wakes from
  // hibernation right when the deadline expires.
  private currentDeadlineMs: number | null = null;

  constructor(state: DurableObjectState, _env: Env) {
    this.state = state;
    // Rehydrate from storage on (re)start so DO eviction during idle doesn't
    // lose the in-progress game. blockConcurrencyWhile keeps requests waiting
    // until restoration completes.
    this.state.blockConcurrencyWhile(async () => {
      const [game, host, code, alarm] = await Promise.all([
        this.state.storage.get<GameState>(STORAGE_KEY_GAME),
        this.state.storage.get<string>(STORAGE_KEY_HOST),
        this.state.storage.get<string>(STORAGE_KEY_CODE),
        this.state.storage.getAlarm(),
      ]);
      if (game) {
        // Old games persisted before the settings field existed — backfill so
        // we don't crash with `cannot read settings of undefined`.
        if (!game.settings) {
          game.settings = { turnTimerSeconds: 60 };
        }
        this.game = game;
      }
      if (host) this.hostSessionId = host;
      if (code) this.roomCode = code;
      if (alarm) this.currentDeadlineMs = alarm;
    });
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // Capture the room code from any path that carries it (`/r/CODE/...` or
    // `/init?code=CODE`). The DO is keyed by `idFromName(code)`, so the code in
    // the URL is authoritative for this instance — but the DO doesn't otherwise
    // know its own name, so we have to lift it off an incoming request.
    const codeFromPath = url.pathname.match(/^\/r\/([A-Z0-9]{4,8})(?:\/|$)/)?.[1];
    const codeFromQuery = url.searchParams.get("code") ?? undefined;
    const incomingCode = codeFromPath ?? codeFromQuery;
    if (incomingCode && !this.roomCode) {
      this.roomCode = incomingCode;
      await this.state.storage.put(STORAGE_KEY_CODE, incomingCode);
    }

    if (url.pathname === "/init") {
      return new Response("ok");
    }

    if (request.headers.get("Upgrade") === "websocket") {
      const pair = new WebSocketPair();
      const client = pair[0];
      const server = pair[1];
      this.handleSocket(server);
      return new Response(null, { status: 101, webSocket: client });
    }

    return new Response("room", { status: 200 });
  }

  private handleSocket(socket: WebSocket): void {
    socket.accept();
    let mySessionId: string | null = null;

    socket.addEventListener("message", (event) => {
      let msg: ClientToServer;
      try {
        msg = JSON.parse(typeof event.data === "string" ? event.data : "");
      } catch {
        this.sendError(socket, "invalid JSON");
        return;
      }

      try {
        switch (msg.type) {
          case "join":
            mySessionId = msg.sessionId;
            this.handleJoin(socket, msg);
            break;
          case "leave":
            if (mySessionId) this.handleLeave(mySessionId);
            break;
          case "start":
            if (!mySessionId) return this.sendError(socket, "not joined");
            this.handleStart(mySessionId, msg.rngSeed);
            break;
          case "action":
            if (!mySessionId) return this.sendError(socket, "not joined");
            this.handleAction(mySessionId, msg.action, msg.clientActionId);
            break;
          case "ping":
            // Heartbeat reply — no work, just echo `t`.
            this.send(socket, { type: "pong", t: msg.t });
            break;
          default:
            this.sendError(socket, "unknown message type");
        }
      } catch (err) {
        const message = err instanceof RuleError ? err.message : "internal error";
        this.sendError(socket, message);
      }
    });

    socket.addEventListener("close", () => {
      if (!mySessionId) return;
      // Only clear the live socket if it's still the one we have for this
      // session — a fast reconnect might have already replaced it.
      if (this.sockets.get(mySessionId) === socket) {
        this.sockets.delete(mySessionId);
      }
      // Mark player as disconnected; keep their slot for now (reconnect grace).
      const session = this.sessions.get(mySessionId);
      const playerId = session?.playerId;
      if (playerId) {
        this.game = produce(this.game, (draft) => {
          const player = draft.players.find((p) => p.id === playerId);
          if (player) player.connected = false;
        });
        this.persistGame();
        this.broadcastState();
      }
    });
  }

  // --- message handlers ----------------------------------------------------

  private handleJoin(socket: WebSocket, msg: Extract<ClientToServer, { type: "join" }>): void {
    if (this.sockets.has(msg.sessionId)) {
      // Same session re-attaches: replace the old socket with the new one.
      try {
        this.sockets.get(msg.sessionId)?.close(1000, "replaced");
      } catch {
        // ignore
      }
    }
    this.sockets.set(msg.sessionId, socket);

    let session = this.sessions.get(msg.sessionId);
    // Lazy-register the session if the game already knows about a player with
    // this id — covers DO restart / post-recovery scenarios where the in-memory
    // sessions Map was cleared but the game state persisted.
    if (!session) {
      const existing = this.game.players.find((p) => p.id === msg.sessionId);
      if (existing) {
        session = { sessionId: msg.sessionId, playerId: msg.sessionId, recentActionIds: [] };
        this.sessions.set(msg.sessionId, session);
        if (!this.hostSessionId) {
          this.hostSessionId = msg.sessionId;
          this.persistHost();
        }
        this.game = produce(this.game, (draft) => {
          const player = draft.players.find((p) => p.id === msg.sessionId);
          if (player) player.connected = true;
        });
      }
    }
    if (!session) {
      // New session: create a player slot if game is still in lobby; otherwise
      // we only honor reconnects to existing sessions.
      if (this.game.phase !== "lobby") {
        return this.sendError(socket, "game already in progress");
      }
      if (this.game.players.length >= 5) {
        return this.sendError(socket, "room full");
      }
      const playerId = msg.sessionId; // session id doubles as player id
      const name = msg.name.slice(0, 24) || "Player";
      this.game = produce(this.game, (draft) => {
        draft.players.push({
          id: playerId,
          name,
          hand: [],
          bank: [],
          propertySets: [],
          connected: true,
        });
      });
      if (!this.hostSessionId) {
        this.hostSessionId = msg.sessionId;
        this.persistHost();
      }
      session = { sessionId: msg.sessionId, playerId, recentActionIds: [] };
      this.sessions.set(msg.sessionId, session);
    } else {
      // Reconnect: mark connected.
      const sessId = session.playerId;
      this.game = produce(this.game, (draft) => {
        const player = draft.players.find((p) => p.id === sessId);
        if (player) player.connected = true;
      });
    }

    this.persistGame();

    const isHost = this.hostSessionId === msg.sessionId;
    this.send(socket, {
      type: "joined",
      playerId: session.playerId!,
      isHost,
      roomCode: this.roomCode ?? "",
    });
    this.broadcastState();
  }

  private handleLeave(sessionId: string): void {
    if (this.game.phase === "lobby") {
      // Drop the player from the lobby.
      const session = this.sessions.get(sessionId);
      if (session?.playerId) {
        const leavingId = session.playerId;
        this.game = produce(this.game, (draft) => {
          draft.players = draft.players.filter((p) => p.id !== leavingId);
        });
        if (this.hostSessionId === sessionId) {
          const next = Array.from(this.sessions.keys()).find((s) => s !== sessionId) ?? null;
          this.hostSessionId = next;
          this.persistHost();
        }
      }
      this.sessions.delete(sessionId);
      this.sockets.delete(sessionId);
    } else {
      // In-game: just disconnect. Player slot remains.
      this.sockets.delete(sessionId);
      const session = this.sessions.get(sessionId);
      const playerId = session?.playerId;
      if (playerId) {
        this.game = produce(this.game, (draft) => {
          const player = draft.players.find((p) => p.id === playerId);
          if (player) player.connected = false;
        });
      }
    }
    this.persistGame();
    void this.armOrClearAlarm();
    this.broadcastState();
  }

  private handleStart(sessionId: string, rngSeed?: number): void {
    if (sessionId !== this.hostSessionId) {
      throw new RuleError("only host can start the game");
    }
    if (this.game.phase !== "lobby") {
      throw new RuleError("game already started");
    }
    if (this.game.players.length < 2) {
      throw new RuleError("need at least 2 players");
    }
    const playersForStart = this.game.players.map((p) => ({ id: p.id, name: p.name }));
    this.game = applyAction(this.game, {
      type: "START_GAME",
      rngSeed: rngSeed ?? (Date.now() & 0x7fffffff),
      players: playersForStart,
    });
    this.persistGame();
    void this.armOrClearAlarm();
    this.broadcastState();
  }

  private handleAction(
    sessionId: string,
    action: Parameters<typeof applyAction>[1],
    clientActionId?: string,
  ): void {
    const session = this.sessions.get(sessionId);
    if (!session?.playerId) throw new RuleError("session has no player");

    // Idempotent replay handling: if we've already applied this action id,
    // just re-broadcast the latest state (so the reconnected client gets a
    // fresh snapshot) and do nothing else.
    if (clientActionId && session.recentActionIds.includes(clientActionId)) {
      const sock = this.sockets.get(sessionId);
      if (sock) {
        const projected = projectStateForPlayer(this.game, session.playerId);
        this.send(sock, { type: "state", state: projected });
      }
      return;
    }

    // Server-side authority: any action's playerId must match the session's
    // player. Engine still enforces turn/pending logic on top.
    if ("playerId" in action && action.playerId !== session.playerId) {
      throw new RuleError("playerId mismatch");
    }
    // Lobby settings are host-only — engine doesn't know who the host is, so
    // we gate it here.
    if (action.type === "UPDATE_SETTINGS" && sessionId !== this.hostSessionId) {
      throw new RuleError("only host can change room settings");
    }
    this.game = applyAction(this.game, action);

    if (clientActionId) {
      session.recentActionIds.push(clientActionId);
      if (session.recentActionIds.length > RECENT_ACTIONS_PER_SESSION) {
        session.recentActionIds.shift();
      }
    }

    this.persistGame();
    void this.armOrClearAlarm();
    this.broadcastState();
  }

  // --- helpers -------------------------------------------------------------

  private send(socket: WebSocket, msg: ServerToClient): void {
    try {
      socket.send(JSON.stringify(msg));
    } catch {
      // ignore
    }
  }

  private sendError(socket: WebSocket, message: string): void {
    this.send(socket, { type: "error", message });
  }

  private broadcastState(): void {
    const deadline = this.currentDeadlineMs ?? undefined;
    for (const [sessionId, socket] of this.sockets) {
      const session = this.sessions.get(sessionId);
      if (!session?.playerId) continue;
      const projected = projectStateForPlayer(this.game, session.playerId, deadline);
      this.send(socket, { type: "state", state: projected });
    }
  }

  // Sets or clears the per-decision turn timer. Called after every state-
  // changing handler. Idempotent: skips storage churn when the deadline
  // hasn't materially changed (within 250ms).
  private async armOrClearAlarm(): Promise<void> {
    const timerSec = this.game.settings?.turnTimerSeconds;
    const someoneOnClock = onClockPlayerId(this.game) !== null;
    if (!someoneOnClock || timerSec == null) {
      if (this.currentDeadlineMs != null) {
        this.currentDeadlineMs = null;
        try {
          await this.state.storage.deleteAlarm();
        } catch {
          // ignore
        }
      }
      return;
    }
    const next = Date.now() + timerSec * 1000;
    this.currentDeadlineMs = next;
    try {
      await this.state.storage.setAlarm(next);
    } catch {
      // ignore — worst case the next handler re-sets it
    }
  }

  // Cloudflare DO Alarms callback. Fires when the deadline we set arrives.
  // We auto-resolve whatever decision the on-clock player owes, broadcast,
  // and re-arm for the next on-clock player.
  async alarm(): Promise<void> {
    // If state advanced after the alarm was scheduled (someone acted right
    // before the alarm fired), re-arm to the current deadline and bail.
    if (this.currentDeadlineMs != null && Date.now() < this.currentDeadlineMs - 250) {
      try {
        await this.state.storage.setAlarm(this.currentDeadlineMs);
      } catch {
        // ignore
      }
      return;
    }

    const auto = autoActionFor(this.game);
    if (auto) {
      try {
        this.game = applyAction(this.game, auto);
        const onClock = onClockPlayerId(this.game);
        const onClockName =
          this.game.players.find((p) => p.id === onClock)?.name ?? "";
        this.game = produce(this.game, (draft) => {
          draft.log.push({
            at: draft.currentTurn,
            message: `Auto-action fired (timer expired)${onClockName ? `; now ${onClockName}` : ""}.`,
          });
        });
        this.persistGame();
      } catch {
        // The engine rejected the auto-action — should be rare. Leave state
        // alone and just re-arm so we try again in `timerSec` seconds.
      }
    }

    await this.armOrClearAlarm();
    this.broadcastState();
  }

  // Coalesced async write: never blocks message handling, never queues more
  // than one pending write. The latest game snapshot at write time is what
  // lands on disk.
  private persistGame(): void {
    if (this.persisting) {
      this.pendingPersist = true;
      return;
    }
    this.persisting = true;
    const write = async (): Promise<void> => {
      try {
        await this.state.storage.put(STORAGE_KEY_GAME, this.game);
      } catch {
        // ignore — next action will retry
      }
      if (this.pendingPersist) {
        this.pendingPersist = false;
        await write();
        return;
      }
      this.persisting = false;
    };
    // Fire and forget; durable object runtime keeps it alive while pending.
    void write();
  }

  private persistHost(): void {
    void this.state.storage.put(STORAGE_KEY_HOST, this.hostSessionId ?? "");
  }
}
