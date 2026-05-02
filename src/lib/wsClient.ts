// Thin WebSocket client — connects to the room DO, joins with session+name,
// receives projected state, and exposes a sendAction helper.
//
// Lifecycle: created in a React effect, returns `close()` for teardown. State
// changes flow into a Zustand store (see `gameStore.ts`).

import type { Action } from "@/engine/reduce";
import type { ProjectedGameState } from "@/engine/project";
import type { PlayerId } from "@/engine/state";

export type WsClientHandlers = {
  onJoined: (info: { playerId: PlayerId; isHost: boolean; roomCode: string }) => void;
  onState: (state: ProjectedGameState) => void;
  onError: (message: string) => void;
  onOpen?: () => void;
  onClose?: () => void;
};

export type WsClient = {
  send: (msg: ClientToServerLike) => void;
  sendAction: (action: Action) => void;
  start: (rngSeed?: number) => void;
  leave: () => void;
  close: () => void;
};

// Mirrors worker/src/protocol.ts ClientToServer minus the type narrowness for
// import simplicity. Kept as a discriminated union so callers stay typed.
export type ClientToServerLike =
  | { type: "join"; sessionId: string; name: string }
  | { type: "leave" }
  | { type: "start"; rngSeed?: number }
  | { type: "action"; action: Action };

export type WsConfig = {
  workerOrigin: string; // e.g. "http://localhost:8787"
  roomCode: string;
  sessionId: string;
  name: string;
  handlers: WsClientHandlers;
};

export function connectRoom(cfg: WsConfig): WsClient {
  const wsScheme = cfg.workerOrigin.startsWith("https") ? "wss" : "ws";
  const wsUrl = cfg.workerOrigin.replace(/^https?/, wsScheme) + `/r/${cfg.roomCode}/ws`;
  const socket = new WebSocket(wsUrl);

  let opened = false;
  // Buffer messages sent before open.
  const queue: ClientToServerLike[] = [];

  function rawSend(msg: ClientToServerLike) {
    socket.send(JSON.stringify(msg));
  }

  function send(msg: ClientToServerLike) {
    if (opened && socket.readyState === WebSocket.OPEN) rawSend(msg);
    else queue.push(msg);
  }

  socket.addEventListener("open", () => {
    opened = true;
    rawSend({ type: "join", sessionId: cfg.sessionId, name: cfg.name });
    while (queue.length > 0) rawSend(queue.shift()!);
    cfg.handlers.onOpen?.();
  });

  socket.addEventListener("message", (ev) => {
    let msg: any;
    try {
      msg = JSON.parse(ev.data);
    } catch {
      return;
    }
    switch (msg.type) {
      case "joined":
        cfg.handlers.onJoined(msg);
        break;
      case "state":
        cfg.handlers.onState(msg.state);
        break;
      case "error":
        cfg.handlers.onError(msg.message);
        break;
    }
  });

  socket.addEventListener("close", () => {
    cfg.handlers.onClose?.();
  });

  return {
    send,
    sendAction: (action) => send({ type: "action", action }),
    start: (rngSeed) => send({ type: "start", rngSeed }),
    leave: () => send({ type: "leave" }),
    close: () => {
      try {
        socket.close();
      } catch {
        // ignore
      }
    },
  };
}
