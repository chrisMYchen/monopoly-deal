// Robust WebSocket client — connects to the room DO, joins with session+name,
// receives projected state, and exposes a sendAction helper.
//
// Robustness features:
//   - Auto-reconnect with exponential backoff (1s -> 15s) until close() is called
//   - Heartbeat: ping every 20s; if no pong within 10s, force a reconnect
//   - Action replay: every action carries a clientActionId; pending actions
//     stay in a queue until the next state echo arrives, then are dropped.
//     On reconnect, pending actions are re-sent — the server dedupes by
//     clientActionId so each action applies at most once.
//
// Lifecycle: created in a React effect, returns `close()` for teardown. State
// changes flow into a Zustand store (see `gameStore.ts`).

import type { Action } from "@/engine/reduce";
import type { ProjectedGameState } from "@/engine/project";
import type { PlayerId } from "@/engine/state";

export type ConnectionStatus = "connecting" | "open" | "reconnecting" | "closed";

export type WsClientHandlers = {
  onJoined: (info: { playerId: PlayerId; isHost: boolean; roomCode: string }) => void;
  onState: (state: ProjectedGameState) => void;
  // permanent=true: server rejected us for good (room full, game in progress);
  // client should stop retrying and show a terminal error.
  onError: (message: string, permanent?: boolean) => void;
  onStatus?: (status: ConnectionStatus) => void;
};

export type WsClient = {
  send: (msg: ClientToServerLike) => void;
  sendAction: (action: Action) => void;
  start: (rngSeed?: number) => void;
  leave: () => void;
  close: () => void;
};

// Mirrors worker/src/protocol.ts ClientToServer.
export type ClientToServerLike =
  | { type: "join"; sessionId: string; name: string }
  | { type: "leave" }
  | { type: "start"; rngSeed?: number }
  | { type: "action"; action: Action; clientActionId?: string }
  | { type: "ping"; t: number };

export type WsConfig = {
  workerOrigin: string; // e.g. "http://localhost:8787"
  roomCode: string;
  sessionId: string;
  name: string;
  handlers: WsClientHandlers;
};

const PING_INTERVAL_MS = 20_000;
const PONG_TIMEOUT_MS = 10_000;
const BACKOFF_START_MS = 1_000;
const BACKOFF_MAX_MS = 15_000;

export function connectRoom(cfg: WsConfig): WsClient {
  const wsScheme = cfg.workerOrigin.startsWith("https") ? "wss" : "ws";
  const wsUrl = cfg.workerOrigin.replace(/^https?/, wsScheme) + `/r/${cfg.roomCode}/ws`;

  let socket: WebSocket | null = null;
  let opened = false;
  let closedByUser = false;
  let attempt = 0;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let pingTimer: ReturnType<typeof setInterval> | null = null;
  let pongTimer: ReturnType<typeof setTimeout> | null = null;

  // Pending outbound actions, kept until acknowledged by a state echo. Each
  // action carries a clientActionId so the server can dedupe replays.
  type PendingAction = {
    clientActionId: string;
    msg: Extract<ClientToServerLike, { type: "action" }>;
  };
  const pendingActions: PendingAction[] = [];

  // Non-action messages sent before the socket opens (e.g. "start", "leave").
  // Cleared on each open since handleJoin re-sends "join" automatically.
  const preOpenQueue: ClientToServerLike[] = [];

  let status: ConnectionStatus = "connecting";
  function setStatus(next: ConnectionStatus): void {
    if (status === next) return;
    status = next;
    cfg.handlers.onStatus?.(next);
  }

  function clearTimers(): void {
    if (pingTimer) {
      clearInterval(pingTimer);
      pingTimer = null;
    }
    if (pongTimer) {
      clearTimeout(pongTimer);
      pongTimer = null;
    }
  }

  function startHeartbeat(): void {
    clearTimers();
    pingTimer = setInterval(() => {
      if (!socket || socket.readyState !== WebSocket.OPEN) return;
      try {
        socket.send(JSON.stringify({ type: "ping", t: Date.now() }));
      } catch {
        // ignore — close handler will trigger reconnect
      }
      // If we don't see a pong before timeout, treat the socket as dead.
      if (pongTimer) clearTimeout(pongTimer);
      pongTimer = setTimeout(() => {
        // Force-close so onclose path schedules a reconnect.
        try {
          socket?.close(4000, "pong timeout");
        } catch {
          // ignore
        }
      }, PONG_TIMEOUT_MS);
    }, PING_INTERVAL_MS);
  }

  function rawSend(msg: ClientToServerLike): boolean {
    if (!socket || socket.readyState !== WebSocket.OPEN) return false;
    try {
      socket.send(JSON.stringify(msg));
      return true;
    } catch {
      return false;
    }
  }

  function send(msg: ClientToServerLike): void {
    if (msg.type === "action") {
      // Tag the action and remember it until the server echoes state.
      const clientActionId = msg.clientActionId ?? newActionId();
      const tagged: PendingAction["msg"] = { ...msg, clientActionId };
      pendingActions.push({ clientActionId, msg: tagged });
      if (!rawSend(tagged)) {
        // Will be re-sent on next open via flushPending().
      }
      return;
    }
    if (opened && rawSend(msg)) return;
    preOpenQueue.push(msg);
  }

  function flushPending(): void {
    // After (re)connect, replay pending actions. Server dedupes by clientActionId.
    for (const p of pendingActions) rawSend(p.msg);
    while (preOpenQueue.length > 0) {
      const m = preOpenQueue[0]!;
      if (!rawSend(m)) break;
      preOpenQueue.shift();
    }
  }

  function scheduleReconnect(): void {
    if (closedByUser) return;
    setStatus("reconnecting");
    const delay = Math.min(BACKOFF_MAX_MS, BACKOFF_START_MS * Math.pow(2, attempt));
    attempt += 1;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(open, delay);
  }

  function open(): void {
    if (closedByUser) return;
    if (status !== "reconnecting") setStatus("connecting");
    let s: WebSocket;
    try {
      s = new WebSocket(wsUrl);
    } catch {
      scheduleReconnect();
      return;
    }
    socket = s;
    opened = false;

    s.addEventListener("open", () => {
      opened = true;
      attempt = 0;
      setStatus("open");
      // Always re-send join first — the server uses sessionId to re-attach.
      rawSend({ type: "join", sessionId: cfg.sessionId, name: cfg.name });
      flushPending();
      startHeartbeat();
    });

    s.addEventListener("message", (ev) => {
      let msg: any;
      try {
        msg = JSON.parse(typeof ev.data === "string" ? ev.data : "");
      } catch {
        return;
      }
      switch (msg.type) {
        case "joined":
          cfg.handlers.onJoined(msg);
          break;
        case "state":
          // Treat any state echo as ack for currently-pending actions: the
          // server applies them in order, so once we see fresh state it's safe
          // to drop the queue. (Worst case: a duplicate replay is deduped
          // server-side by clientActionId.)
          pendingActions.length = 0;
          cfg.handlers.onState(msg.state);
          break;
        case "error": {
          // Permanent errors: server will never let us in for this session.
          // Stop the retry loop so the UI can show a terminal error state.
          const permanent =
            msg.message === "game already in progress" || msg.message === "room full";
          if (permanent) {
            closedByUser = true;
            setStatus("closed");
            try {
              socket?.close(1000, "permanent error");
            } catch {
              // ignore
            }
            socket = null;
          }
          cfg.handlers.onError(msg.message, permanent);
          break;
        }
        case "pong":
          if (pongTimer) {
            clearTimeout(pongTimer);
            pongTimer = null;
          }
          break;
      }
    });

    s.addEventListener("close", () => {
      clearTimers();
      opened = false;
      socket = null;
      if (closedByUser) {
        setStatus("closed");
        return;
      }
      scheduleReconnect();
    });

    s.addEventListener("error", () => {
      // The browser will also fire 'close' — let that handler do the work.
    });
  }

  open();

  return {
    send,
    sendAction: (action) => send({ type: "action", action }),
    start: (rngSeed) => send({ type: "start", rngSeed }),
    leave: () => send({ type: "leave" }),
    close: () => {
      closedByUser = true;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      clearTimers();
      try {
        socket?.close(1000, "client close");
      } catch {
        // ignore
      }
      socket = null;
      setStatus("closed");
    },
  };
}

function newActionId(): string {
  // Short random id is sufficient: dedup is per-session.
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}
