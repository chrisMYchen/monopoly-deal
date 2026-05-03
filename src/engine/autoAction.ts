// Pure helpers for the turn timer: derive whose decision the game is currently
// blocked on, and produce a deterministic, rules-legal action to auto-resolve
// that decision when the timer expires. The worker calls these — the engine
// itself stays free of wall-clock concerns.

import { SET_DEFS, bankValueOf, cardById, type CardId, type SetColor } from "./cards";
import type { Action } from "./reduce";
import type { GameState, Pending, Player, PlayerId, PropertySet } from "./state";

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
    case "awaitWildAssignment":
      return pending.ownerId;
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
      const cardIds = pickAutoPayment(payer, pending.amountOwed);
      return { type: "PAY", playerId, cardIds };
    }

    case "awaitDiscardToLimit": {
      const player = state.players.find((p) => p.id === playerId);
      if (!player) return null;
      const cardIds = pickAutoDiscard(player.hand, pending.mustDiscard);
      return { type: "DISCARD_TO_LIMIT", playerId, cardIds };
    }

    case "awaitWildAssignment": {
      // Engine has no path to dispatch this currently (it's surfaced for UI
      // only). Leaving null falls back to a no-op re-arm by the worker.
      return null;
    }
  }
}

// Pick the lowest-value subset of cards (bank first, then "least valuable"
// property cards) that covers `amountOwed`. Avoids breaking complete sets when
// a non-set-breaking selection still covers the debt. If the player can't
// cover the debt, returns every asset they own (engine treats this as paying
// what they have).
export function pickAutoPayment(payer: Player, amountOwed: number): CardId[] {
  const bankSorted = [...payer.bank].sort(
    (a, b) => bankValueOf(cardById(a)) - bankValueOf(cardById(b)),
  );
  const looseProps: CardId[] = []; // properties in incomplete sets
  const completeProps: CardId[] = []; // properties in complete sets — last resort
  for (const group of payer.propertySets) {
    const target = isComplete(group) ? completeProps : looseProps;
    for (const cid of group.cardIds) target.push(cid);
  }
  const sortByValue = (a: CardId, b: CardId) =>
    bankValueOf(cardById(a)) - bankValueOf(cardById(b));
  looseProps.sort(sortByValue);
  completeProps.sort(sortByValue);

  const ordered = [...bankSorted, ...looseProps, ...completeProps];
  const totalValue = ordered.reduce((sum, cid) => sum + bankValueOf(cardById(cid)), 0);

  if (totalValue <= amountOwed) {
    // Pay everything we have; engine forgives the rest.
    return ordered;
  }

  const picked: CardId[] = [];
  let acc = 0;
  for (const cid of ordered) {
    if (acc >= amountOwed) break;
    picked.push(cid);
    acc += bankValueOf(cardById(cid));
  }
  return picked;
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

function isComplete(group: PropertySet): boolean {
  return group.cardIds.length >= SET_DEFS[group.color as SetColor].complete;
}
