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
  // `clientActionId` lets the server dedupe replays after a reconnect; the
  // client tags every action with a fresh id and re-sends pending actions on
  // reconnect, so the server must apply each id at most once.
  | { type: "action"; action: Action; clientActionId?: string }
  // Heartbeat: client sends ping, server replies with pong echoing `t`.
  | { type: "ping"; t: number };

export type ServerToClient =
  | { type: "joined"; playerId: PlayerId; isHost: boolean; roomCode: string }
  | { type: "state"; state: ProjectedGameState }
  | { type: "error"; message: string }
  | { type: "kicked"; reason: string }
  | { type: "pong"; t: number };
