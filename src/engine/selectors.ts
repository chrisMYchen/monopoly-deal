// Pure derived-state helpers consumed by the UI. Kept in `engine/` so they
// share the same source of truth as the reducer and tests can use them too.

import {
  SET_DEFS,
  bankValueOf,
  cardById,
  type Card,
  type CardId,
  type SetColor,
} from "./cards";
import type { TableauGroup } from "./state";

// How many distinct-color complete sets a player has. Win condition is >= 3.
export function distinctCompletedSets(player: { tableau: TableauGroup[] }): number {
  const colors = new Set<SetColor>();
  for (const g of player.tableau) {
    if (g.cardIds.length >= SET_DEFS[g.color].complete) {
      colors.add(g.color);
    }
  }
  return colors.size;
}

// Rent for a single group, including House/Hotel modifiers. Returns 0 if the
// group is empty or color has no entry on the ladder for current count.
export function rentForGroup(group: TableauGroup): number {
  if (group.cardIds.length === 0) return 0;
  const def = SET_DEFS[group.color];
  const ladderIdx = Math.min(group.cardIds.length, def.complete) - 1;
  let rent = def.rentLadder[ladderIdx] ?? 0;
  if (group.hasHouse) rent += 3;
  if (group.hasHotel) rent += 4;
  return rent;
}

// Total cash value of bank + tableau (matches engine's netWorth).
export function netWorth(player: { bank: CardId[]; tableau: TableauGroup[] }): number {
  let total = 0;
  for (const cid of player.bank) total += bankValueOf(cardById(cid));
  for (const g of player.tableau) {
    for (const cid of g.cardIds) total += bankValueOf(cardById(cid));
    if (g.hasHouse) total += 3;
    if (g.hasHotel) total += 4;
  }
  return total;
}

// Categorize a card kind for the optional hand sort. The sort order
// (money → property → action) matches how experienced players think about
// "spend / build / scheme."
export function cardCategory(card: Card): "money" | "property" | "action" {
  switch (card.kind) {
    case "money":
      return "money";
    case "property":
    case "wild2":
    case "wild10":
      return "property";
    case "action":
      return "action";
  }
}

// Stable sort key for card sorting. Primary by category, then by value desc.
export function handSortKey(card: Card): [number, number, string] {
  const cat = cardCategory(card);
  const catOrder = cat === "money" ? 0 : cat === "property" ? 1 : 2;
  const value = bankValueOf(card);
  return [catOrder, -value, card.id];
}

// Reshuffle warning. Players at the table can see the deck visibly thinning;
// this is just a clearer indicator rather than pre-computed strategy info.
export function isReshuffleImminent(drawPileCount: number): boolean {
  return drawPileCount > 0 && drawPileCount <= 5;
}
