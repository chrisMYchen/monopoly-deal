// Wire protocol between browser and Durable Object.
import type { Action } from "../../src/engine/reduce";
import type { ProjectedGameState } from "../../src/engine/project";
import type { PlayerId } from "../../src/engine/state";

export type ClientToServer =
  | { type: "join"; sessionId: string; name: string }
  | { type: "leave" }
  // Host-only.
  | { type: "start"; rngSeed?: number }
  // Game action — server validates `action.playerId === session.playerId`.
  | { type: "action"; action: Action };

export type ServerToClient =
  | { type: "joined"; playerId: PlayerId; isHost: boolean; roomCode: string }
  | { type: "state"; state: ProjectedGameState }
  | { type: "error"; message: string }
  | { type: "kicked"; reason: string };
