// Zustand store mirroring the projected server state plus connection metadata.
// Components read this with useGame; the WebSocket client writes to it.

import { create } from "zustand";

import type { ProjectedGameState } from "@/engine/project";
import type { PlayerId } from "@/engine/state";

export type GameStoreState = {
  state: ProjectedGameState | null;
  selfId: PlayerId | null;
  isHost: boolean;
  roomCode: string;
  errorBanner: string | null;
  connection: "connecting" | "open" | "closed";
};

export type GameStoreActions = {
  setState: (s: ProjectedGameState) => void;
  setJoined: (info: { playerId: PlayerId; isHost: boolean; roomCode: string }) => void;
  setError: (message: string | null) => void;
  setConnection: (c: GameStoreState["connection"]) => void;
  reset: () => void;
};

const initial: GameStoreState = {
  state: null,
  selfId: null,
  isHost: false,
  roomCode: "",
  errorBanner: null,
  connection: "connecting",
};

export const useGame = create<GameStoreState & GameStoreActions>((set) => ({
  ...initial,
  setState: (s) => set({ state: s }),
  setJoined: (info) =>
    set({ selfId: info.playerId, isHost: info.isHost, roomCode: info.roomCode }),
  setError: (message) => set({ errorBanner: message }),
  setConnection: (c) => set({ connection: c }),
  reset: () => set(initial),
}));
