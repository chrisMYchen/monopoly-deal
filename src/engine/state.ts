import type { CardId, SetColor } from "./cards";

export type PlayerId = string;

// One color group in a player's tableau. Houses/Hotels attach to standard-color
// sets only (not RR/Util) and only when the set is complete; rent calculation
// reads them. If the set is later broken, House/Hotel detach (handled in the
// reducer per the deterministic policy in plan §"Open verification items").
export type TableauGroup = {
  color: SetColor;
  // Card ids in the group. Wilds are tracked here, with their currently-assigned
  // color matching `color`. A wild's *underlying* card id stays the same; the
  // assignment is implied by which group it lives in.
  cardIds: CardId[];
  hasHouse: boolean;
  hasHotel: boolean;
};

export type Player = {
  id: PlayerId;
  name: string;
  hand: CardId[];
  bank: CardId[]; // money + action-as-money (face-up sideways)
  tableau: TableauGroup[];
  connected: boolean;
};

export type LogEntry = {
  at: number; // turn index for ordering
  message: string;
};

// What the action would do if the JSN window resolves in favor of the source.
// Captured at the moment the action is played so it can be replayed verbatim
// once JSN chains settle.
export type DeclaredAction =
  | { kind: "slyDeal"; sourceId: PlayerId; targetId: PlayerId; targetCardId: CardId }
  | {
      kind: "forcedDeal";
      sourceId: PlayerId;
      targetId: PlayerId;
      sourceCardId: CardId;
      targetCardId: CardId;
    }
  | { kind: "dealBreaker"; sourceId: PlayerId; targetId: PlayerId; targetColor: SetColor; targetGroupIdx: number }
  | { kind: "debtCollector"; sourceId: PlayerId; targetId: PlayerId }
  | { kind: "birthday"; sourceId: PlayerId }
  | {
      kind: "rent";
      sourceId: PlayerId;
      color: SetColor;
      multiplier: number; // 1, 2, or 4 — for Double The Rent stacking
      targetIds: PlayerId[]; // single-target for ★ wild rent; all opponents for 2-color
    };

// What the engine is currently waiting for. Null = active player can act freely
// within their normal turn budget.
//
// Multi-target actions (Birthday, 2-color Rent) flow as: JSN window → maybe
// payment → next defender's JSN window → … → finalize. Both pending kinds carry
// the bookkeeping needed to advance through that queue in `playCost`,
// `declaration`, and `remainingDemands`. Previously these were attached as
// `__`-prefixed side-channel fields via `as any` casts; now they're typed.
export type Pending =
  | null
  | { kind: "awaitDiscardToLimit"; playerId: PlayerId; mustDiscard: number }
  | {
      // JSN window for the next defender in `pendingDefenders`. The current
      // defender is `pendingDefenders[0]`. Each JSN played by either side flips
      // the meaning of the stack; the action proceeds when the stack length is
      // even, fails when odd. `actionCardId` is the action card that initiated
      // this whole sequence — discarded on resolution; goes to `discardPile`.
      kind: "awaitJustSayNo";
      declaration: DeclaredAction;
      actionCardId: CardId;
      pendingDefenders: PlayerId[];
      jsnStack: PlayerId[]; // who played JSN, in order
      // True when the *responder* is the one who would be canceling now (i.e.
      // jsnStack length is odd); false when it's the original target deciding
      // whether to JSN the action itself.
      responderIsActor: boolean;
      // How many of the active player's 3 plays this whole sequence consumes.
      // Defaults to 1; Double The Rent stacking can push it to 2 or 3.
      playCost: number;
      // For multi-target actions: demands queued behind the current defender,
      // re-opened as JSN windows after each payment resolves.
      remainingDemands: { payerId: PlayerId; amountOwed: number }[];
    }
  | {
      kind: "awaitPayment";
      payerId: PlayerId;
      payeeId: PlayerId;
      amountOwed: number;
      // The action card that triggered the payment — not yet discarded; goes
      // to discard once all demands are settled.
      actionCardId: CardId;
      // Carried across the JSN ↔ Payment loop so we can re-open JSN windows
      // for the remaining defenders after this payment resolves.
      declaration: DeclaredAction;
      playCost: number;
      remainingDemands: { payerId: PlayerId; amountOwed: number }[];
    }
  | {
      kind: "awaitWildAssignment";
      cardId: CardId;
      ownerId: PlayerId;
      reason: "moved-during-payment";
    };

export type GameState = {
  phase: "lobby" | "playing" | "ended";
  players: Player[];
  currentTurn: number;       // index into players
  playsRemaining: number;    // 0..3 within the active turn
  hasDrawnThisTurn: boolean; // start-of-turn draw must happen before plays
  drawPile: CardId[];
  discardPile: CardId[];
  pending: Pending;
  log: LogEntry[];
  rngState: number;          // mulberry32 seed; advances on every random op
  winnerId?: PlayerId;
};

export function emptyTableau(): TableauGroup[] {
  return [];
}

export function findGroup(player: Player, color: SetColor): TableauGroup | undefined {
  return player.tableau.find((g) => g.color === color);
}

export function findGroupIndex(player: Player, color: SetColor): number {
  return player.tableau.findIndex((g) => g.color === color);
}
