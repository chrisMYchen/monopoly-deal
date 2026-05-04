// Dev-only `window.__rr` bridge for the local sim harness (see sim/play.ts).
// Lets an external driver read projected state and send actions through the
// same WS client React uses, without going through the DOM. Gated on
// NODE_ENV !== "production"; the install function is a no-op otherwise so the
// bundle still tree-shakes cleanly in prod.

import type { Action } from "@/engine/reduce";
import type { ProjectedGameState } from "@/engine/project";
import type { PlayerId } from "@/engine/state";

import { useGame } from "./gameStore";
import { greedyPolicy, randomValidPolicy } from "./simPolicy";
import type { WsClient } from "./wsClient";

type Bridge = {
  // Snapshot accessors (single read, no subscription).
  getState: () => ProjectedGameState | null;
  getSelfId: () => PlayerId | null;
  getRoomCode: () => string;
  isHost: () => boolean;
  connection: () => string;
  // Monotonic counter that ticks every time the store updates. The harness
  // polls this to know when an action has been echoed back from the server.
  tick: () => number;
  // Active-client ops. Null-safe — if no GameRoom is mounted these are no-ops.
  send: (action: Action) => void;
  start: (rngSeed?: number) => void;
  // Send an action and resolve with the next projection echo from the server.
  // Cuts harness round-trips: one JS call instead of send + poll-tick + read.
  sendAndAwait: (
    action: Action,
    timeoutMs?: number,
  ) => Promise<ProjectedGameState | null>;
  // Run one full policy step in-browser: read state, pick a legal action,
  // send + await echo, return the new state. Halves harness round-trips
  // because the policy decision happens in the same JS call as the send.
  // Only fires if it's *this* seat's turn to act; otherwise returns the
  // current state unchanged.
  policyStep: (
    rngSeed: number,
    timeoutMs?: number,
    kind?: "random" | "greedy",
  ) => Promise<{ action: Action | null; state: ProjectedGameState | null }>;
};

declare global {
  // eslint-disable-next-line no-var
  var __rr: Bridge | undefined;
  interface Window {
    __rr?: Bridge;
  }
}

let activeClient: WsClient | null = null;
let stateTick = 0;
let installed = false;

function isEnabled(): boolean {
  if (typeof window === "undefined") return false;
  // Next.js inlines NODE_ENV at build time. Guard so production strips this.
  return process.env.NODE_ENV !== "production";
}

function ensureInstalled(): void {
  if (installed) return;
  if (!isEnabled()) return;
  installed = true;
  useGame.subscribe(() => {
    stateTick += 1;
  });
  const bridge: Bridge = {
    getState: () => useGame.getState().state,
    getSelfId: () => useGame.getState().selfId,
    getRoomCode: () => useGame.getState().roomCode,
    isHost: () => useGame.getState().isHost,
    connection: () => useGame.getState().connection,
    tick: () => stateTick,
    send: (action) => activeClient?.sendAction(action),
    start: (rngSeed) => activeClient?.start(rngSeed),
    sendAndAwait: (action, timeoutMs = 4000) => {
      return new Promise((resolve) => {
        let done = false;
        const finish = (s: ProjectedGameState | null): void => {
          if (done) return;
          done = true;
          unsub();
          clearTimeout(timer);
          resolve(s);
        };
        const unsub = useGame.subscribe((s, prev) => {
          // Resolve on the first state-field update OR a fresh error banner
          // (a rejected action has no state echo but does set errorBanner).
          if (s.state !== prev.state) finish(s.state);
          else if (s.errorBanner && s.errorBanner !== prev.errorBanner)
            finish(prev.state);
        });
        const timer = setTimeout(
          () => finish(useGame.getState().state),
          timeoutMs,
        );
        activeClient?.sendAction(action);
      });
    },
    policyStep: async (rngSeed, timeoutMs = 2500, kind = "greedy") => {
      const store = useGame.getState();
      const state = store.state;
      const selfId = store.selfId;
      if (!state || !selfId) return { action: null, state };
      const policy =
        kind === "random" ? randomValidPolicy(rngSeed) : greedyPolicy(rngSeed);
      const action = policy(state, selfId);
      if (!action) return { action: null, state };
      const newState = await new Promise<ProjectedGameState | null>((resolve) => {
        let done = false;
        const finish = (s: ProjectedGameState | null): void => {
          if (done) return;
          done = true;
          unsub();
          clearTimeout(timer);
          resolve(s);
        };
        const unsub = useGame.subscribe((s, prev) => {
          if (s.state !== prev.state) finish(s.state);
        });
        const timer = setTimeout(
          () => finish(useGame.getState().state),
          timeoutMs,
        );
        activeClient?.sendAction(action);
      });
      return { action, state: newState };
    },
  };
  window.__rr = bridge;
}

export function setBridgeClient(client: WsClient | null): void {
  if (!isEnabled()) return;
  ensureInstalled();
  activeClient = client;
}
