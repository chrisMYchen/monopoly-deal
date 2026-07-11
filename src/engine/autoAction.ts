// Pure helpers for the turn timer: derive whose decision the game is currently
// blocked on, and produce a deterministic, rules-legal action to auto-resolve
// that decision when the timer expires. The worker calls these — the engine
// itself stays free of wall-clock concerns.

import { bankValueOf, cardById, type CardId } from "./cards";
import { suggestPayment } from "./payment";
import type { Action } from "./reduce";
import type { GameState, Pending, Player, PlayerId } from "./state";

// Who the timer is currently counting down on. Returns null when no one is
// on the clock (lobby, ended, or a malformed state).
export function onClockPlayerId(state: GameState): PlayerId | null {
  if (state.phase !== "playing") return null;
  const pending = state.pending;
  if (pending == null) {
    return state.players[state.currentTurn]?.id ?? null;
  }
  switch (pending.kind) {
    case "awaitDiscardToLimit":
      return pending.playerId;
    case "awaitJustSayNo":
      return pending.responderIsActor
        ? pending.declaration.sourceId
        : (pending.pendingDefenders[0] ?? null);
    case "awaitPayment":
      return pending.payerId;
  }
}

// Build the action that the on-clock player would have to take if they did
// the bare minimum to keep the game moving. Returns null when no auto-action
// applies (game ended, lobby, etc.).
export function autoActionFor(state: GameState): Action | null {
  const playerId = onClockPlayerId(state);
  if (!playerId) return null;
  const pending: Pending = state.pending;

  if (pending == null) {
    if (!state.hasDrawnThisTurn) {
      return { type: "DRAW_TURN_START", playerId };
    }
    return { type: "END_TURN", playerId };
  }

  switch (pending.kind) {
    case "awaitJustSayNo":
      return { type: "RESPOND_JSN", playerId, play: false };

    case "awaitPayment": {
      const payer = state.players.find((p) => p.id === playerId);
      if (!payer) return null;
      const payee = state.players.find((p) => p.id === pending.payeeId);
      const cardIds = pickAutoPayment(payer, pending.amountOwed, payee);
      return { type: "PAY", playerId, cardIds };
    }

    case "awaitDiscardToLimit": {
      const player = state.players.find((p) => p.id === playerId);
      if (!player) return null;
      const cardIds = pickAutoDiscard(player.hand, pending.mustDiscard);
      return { type: "DISCARD_TO_LIMIT", playerId, cardIds };
    }
  }
}

// Pick the payment set for `amountOwed` via the canonical solver in
// payment.ts: never gift the payee a set-completing card, exact change over
// greedy (no change is given), bank before loose properties before
// complete-set cards, fewest cards on ties. If the player can't cover the
// debt, returns every asset they own (engine treats this as paying what
// they have).
export function pickAutoPayment(payer: Player, amountOwed: number, payee?: Player): CardId[] {
  return suggestPayment(payer, amountOwed, payee).cardIds;
}

// Discard the N lowest-bank-value cards from the player's hand, breaking ties
// by card id for determinism.
export function pickAutoDiscard(hand: CardId[], count: number): CardId[] {
  const ordered = [...hand].sort((a, b) => {
    const va = bankValueOf(cardById(a));
    const vb = bankValueOf(cardById(b));
    if (va !== vb) return va - vb;
    return a.localeCompare(b);
  });
  return ordered.slice(0, count);
}
