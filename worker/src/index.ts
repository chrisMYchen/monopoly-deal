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

// Attached to each hibernation-managed WebSocket so we can recover sessionId
// after the DO wakes from eviction with no in-memory sockets map.
type SocketAttachment = { sessionId: string };

const RECENT_ACTIONS_PER_SESSION = 64;

// How long an abandoned (all-disconnected) room is kept alive before its
// state is wiped. Prevents orphaned rooms from accumulating DO duration via
// indefinitely-firing turn-timer alarms.
const ABANDON_TTL_MS = 30 * 60 * 1000; // 30 minutes

// Storage keys.
const STORAGE_KEY_GAME = "game";
const STORAGE_KEY_HOST = "host";
const STORAGE_KEY_CODE = "code";
// Marks that the currently-stored alarm is the abandon-cleanup alarm, not a
// turn-timer alarm, so we can distinguish them after a DO eviction+revival.
const STORAGE_KEY_CLEANUP_ALARM = "cleanup_alarm";

export class Room {
  private state: DurableObjectState;
  private game: GameState = initialLobby();
  // sessionId -> session metadata (playerId etc.)
  private sessions = new Map<string, SessionInfo>();
  private hostSessionId: string | null = null;
  private roomCode: string | null = null;
  // Coalesce frequent storage writes: at most one write in flight at a time,
  // with the latest snapshot scheduled if a write lands during one.
  private pendingPersist = false;
  private persisting = false;
  // Server epoch ms by which the on-clock player must act, or null when no
  // turn-timer alarm is running. null means any currently-set alarm is the
  // abandon-cleanup alarm, not a turn timer.
  private currentDeadlineMs: number | null = null;

  constructor(state: DurableObjectState, _env: Env) {
    this.state = state;
    // Rehydrate from storage on (re)start so DO eviction during idle doesn't
    // lose the in-progress game. blockConcurrencyWhile keeps requests waiting
    // until restoration completes.
    this.state.blockConcurrencyWhile(async () => {
      const [game, host, code, alarm, isCleanup] = await Promise.all([
        this.state.storage.get<GameState>(STORAGE_KEY_GAME),
        this.state.storage.get<string>(STORAGE_KEY_HOST),
        this.state.storage.get<string>(STORAGE_KEY_CODE),
        this.state.storage.getAlarm(),
        this.state.storage.get<boolean>(STORAGE_KEY_CLEANUP_ALARM),
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
      // Only restore the deadline for turn-timer alarms; cleanup alarms leave
      // currentDeadlineMs as null so alarm() can distinguish them.
      if (alarm && !isCleanup) this.currentDeadlineMs = alarm;
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
    // Use the Hibernating WebSocket API so the DO can be evicted between
    // messages rather than staying alive for the duration of every game.
    // Cloudflare dispatches incoming messages to webSocketMessage() below.
    this.state.acceptWebSocket(socket);
  }

  // Cloudflare calls this for each message on a hibernation-managed socket.
  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    let msg: ClientToServer;
    try {
      msg = JSON.parse(typeof message === "string" ? message : "");
    } catch {
      this.sendError(ws, "invalid JSON");
      return;
    }

    const attachment = ws.deserializeAttachment() as SocketAttachment | null;
    const mySessionId = attachment?.sessionId ?? null;

    try {
      switch (msg.type) {
        case "join":
          await this.handleJoin(ws, msg);
          break;
        case "leave":
          if (mySessionId) await this.handleLeave(ws, mySessionId);
          break;
        case "start":
          if (!mySessionId) return this.sendError(ws, "not joined");
          this.handleStart(mySessionId, msg.rngSeed);
          break;
        case "action":
          if (!mySessionId) return this.sendError(ws, "not joined");
          this.handleAction(mySessionId, msg.action, msg.clientActionId);
          break;
        case "ping":
          // Heartbeat reply — no work, just echo `t`.
          this.send(ws, { type: "pong", t: msg.t });
          break;
        default:
          this.sendError(ws, "unknown message type");
      }
    } catch (err) {
      const message = err instanceof RuleError ? err.message : "internal error";
      this.sendError(ws, message);
    }
  }

  // Cloudflare calls this when a hibernation-managed socket closes.
  async webSocketClose(ws: WebSocket, _code: number, _reason: string, _wasClean: boolean): Promise<void> {
    const attachment = ws.deserializeAttachment() as SocketAttachment | null;
    const mySessionId = attachment?.sessionId;
    if (!mySessionId) return;

    // Fast-reconnect guard: if another socket for this session already took
    // over (analogous to the old `this.sockets.get(id) === socket` check),
    // this close event is stale — skip cleanup.
    const current = this.getSocketForSession(mySessionId);
    if (current && current !== ws) return;

    const session = this.sessions.get(mySessionId);
    const playerId = session?.playerId;
    if (playerId) {
      this.game = produce(this.game, (draft) => {
        const player = draft.players.find((p) => p.id === playerId);
        if (player) player.connected = false;
      });
      this.persistGame();

      // When the room empties, suspend the turn timer and start an abandon
      // countdown. This stops the DO from waking every 60 s for an empty room.
      if (this.state.getWebSockets().length === 0) {
        this.currentDeadlineMs = null;
        try {
          await this.state.storage.deleteAlarm();
          await this.state.storage.put(STORAGE_KEY_CLEANUP_ALARM, true);
          await this.state.storage.setAlarm(Date.now() + ABANDON_TTL_MS);
        } catch {
          // ignore
        }
      }

      this.broadcastState();
    }
  }

  async webSocketError(ws: WebSocket, _error: unknown): Promise<void> {
    try {
      ws.close(1011, "internal error");
    } catch {
      // ignore
    }
  }

  // --- message handlers ----------------------------------------------------

  private async handleJoin(ws: WebSocket, msg: Extract<ClientToServer, { type: "join" }>): Promise<void> {
    const oldSocket = this.getSocketForSession(msg.sessionId);
    if (oldSocket && oldSocket !== ws) {
      // Same session re-attaches: close the old socket.
      try {
        oldSocket.close(1000, "replaced");
      } catch {
        // ignore
      }
    }
    // Stamp the sessionId on this socket so we can recover it after hibernation.
    ws.serializeAttachment({ sessionId: msg.sessionId } satisfies SocketAttachment);

    // Cancel any pending abandon-cleanup alarm — a player has reconnected.
    if (this.currentDeadlineMs == null) {
      try {
        await this.state.storage.deleteAlarm();
        await this.state.storage.delete(STORAGE_KEY_CLEANUP_ALARM);
      } catch {
        // ignore
      }
    }

    let session = this.sessions.get(msg.sessionId);
    // Lazy-register the session if the game already knows about a player with
    // this id — covers DO restart / post-recovery scenarios where the in-memory
    // sessions Map was cleared but the game state persisted.
    if (!session) {
      const existingPlayer = this.game.players.find((p) => p.id === msg.sessionId);
      if (existingPlayer) {
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
        return this.sendError(ws, "game already in progress");
      }
      if (this.game.players.length >= 5) {
        return this.sendError(ws, "room full");
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
      // Reconnect: mark connected and resume the turn timer if game is active.
      const sessId = session.playerId;
      this.game = produce(this.game, (draft) => {
        const player = draft.players.find((p) => p.id === sessId);
        if (player) player.connected = true;
      });
      void this.armOrClearAlarm();
    }

    this.persistGame();

    const isHost = this.hostSessionId === msg.sessionId;
    this.send(ws, {
      type: "joined",
      playerId: session.playerId!,
      isHost,
      roomCode: this.roomCode ?? "",
    });
    this.broadcastState();
  }

  private async handleLeave(ws: WebSocket, sessionId: string): Promise<void> {
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
    } else {
      // In-game: just disconnect. Player slot remains for reconnect.
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
    try {
      ws.close(1000, "left");
    } catch {
      // ignore
    }
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
      const sock = this.getSocketForSession(sessionId);
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

  private getSocketForSession(sessionId: string): WebSocket | undefined {
    return this.state.getWebSockets().find(
      (ws) => (ws.deserializeAttachment() as SocketAttachment | null)?.sessionId === sessionId,
    );
  }

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
    for (const ws of this.state.getWebSockets()) {
      const attachment = ws.deserializeAttachment() as SocketAttachment | null;
      const sessionId = attachment?.sessionId;
      if (!sessionId) continue;
      const session = this.sessions.get(sessionId);
      if (!session?.playerId) continue;
      const projected = projectStateForPlayer(this.game, session.playerId, deadline);
      this.send(ws, { type: "state", state: projected });
    }
  }

  // Sets or clears the per-decision turn timer. Called after every state-
  // changing handler. Idempotent: skips storage churn when the deadline
  // hasn't materially changed (within 1 second).
  private async armOrClearAlarm(): Promise<void> {
    const timerSec = this.game.settings?.turnTimerSeconds;
    const someoneOnClock = onClockPlayerId(this.game) !== null;
    if (!someoneOnClock || timerSec == null) {
      if (this.currentDeadlineMs != null) {
        this.currentDeadlineMs = null;
        try {
          await this.state.storage.delete(STORAGE_KEY_CLEANUP_ALARM);
          await this.state.storage.deleteAlarm();
        } catch {
          // ignore
        }
      }
      return;
    }
    const next = Date.now() + timerSec * 1000;
    // Skip storage write if the deadline hasn't meaningfully shifted.
    if (this.currentDeadlineMs != null && Math.abs(next - this.currentDeadlineMs) < 1000) {
      return;
    }
    this.currentDeadlineMs = next;
    try {
      await this.state.storage.delete(STORAGE_KEY_CLEANUP_ALARM);
      await this.state.storage.setAlarm(next);
    } catch {
      // ignore — worst case the next handler re-sets it
    }
  }

  // Cloudflare DO Alarms callback. Fires when the deadline we set arrives.
  async alarm(): Promise<void> {
    // currentDeadlineMs == null means this is the abandon-cleanup alarm (set
    // in webSocketClose when the room went empty). Wipe state so the DO stops
    // waking up for an orphaned room.
    if (this.currentDeadlineMs == null) {
      if (this.state.getWebSockets().length === 0) {
        await this.state.storage.deleteAll();
      }
      return;
    }

    // If state advanced after the alarm was scheduled (someone acted right
    // before the alarm fired), re-arm to the current deadline and bail.
    if (Date.now() < this.currentDeadlineMs - 250) {
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
