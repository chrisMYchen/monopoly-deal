/// <reference types="@cloudflare/workers-types" />

import { produce } from "immer";

import { applyAction, RuleError, initialLobby } from "../../src/engine/reduce";
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
};

export class Room {
  private state: DurableObjectState;
  private game: GameState = initialLobby();
  // sessionId -> session metadata (playerId etc.)
  private sessions = new Map<string, SessionInfo>();
  // Live sockets indexed by sessionId so we can deliver state and detect dupes.
  private sockets = new Map<string, WebSocket>();
  private hostSessionId: string | null = null;
  private roomCode: string | null = null;

  constructor(state: DurableObjectState, _env: Env) {
    this.state = state;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/init") {
      const code = url.searchParams.get("code");
      if (code && !this.roomCode) this.roomCode = code;
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
            this.handleAction(mySessionId, msg.action);
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
      this.sockets.delete(mySessionId);
      // Mark player as disconnected; keep their slot for now (reconnect grace).
      const session = this.sessions.get(mySessionId);
      const playerId = session?.playerId;
      if (playerId) {
        this.game = produce(this.game, (draft) => {
          const player = draft.players.find((p) => p.id === playerId);
          if (player) player.connected = false;
        });
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
        session = { sessionId: msg.sessionId, playerId: msg.sessionId };
        this.sessions.set(msg.sessionId, session);
        if (!this.hostSessionId) this.hostSessionId = msg.sessionId;
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
          tableau: [],
          connected: true,
        });
      });
      if (!this.hostSessionId) this.hostSessionId = msg.sessionId;
      session = { sessionId: msg.sessionId, playerId };
      this.sessions.set(msg.sessionId, session);
    } else {
      // Reconnect: mark connected.
      const sessId = session!.playerId;
      this.game = produce(this.game, (draft) => {
        const player = draft.players.find((p) => p.id === sessId);
        if (player) player.connected = true;
      });
    }

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
          this.hostSessionId = this.sessions.size > 1 ? Array.from(this.sessions.keys()).find((s) => s !== sessionId) ?? null : null;
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
    this.broadcastState();
  }

  private handleAction(sessionId: string, action: Parameters<typeof applyAction>[1]): void {
    const session = this.sessions.get(sessionId);
    if (!session?.playerId) throw new RuleError("session has no player");
    // Server-side authority: any action's playerId must match the session's
    // player. Engine still enforces turn/pending logic on top.
    if ("playerId" in action && action.playerId !== session.playerId) {
      throw new RuleError("playerId mismatch");
    }
    this.game = applyAction(this.game, action);
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
    for (const [sessionId, socket] of this.sockets) {
      const session = this.sessions.get(sessionId);
      if (!session?.playerId) continue;
      const projected = projectStateForPlayer(this.game, session.playerId);
      this.send(socket, { type: "state", state: projected });
    }
  }
}
