// Payment suggestion: the one canonical answer to "which cards should I hand
// over for this debt?". Used by the PaymentDialog auto-fill, the turn-timer
// auto-payer, and the sim bot policy so they can never drift apart.
//
// Objective, in strict priority order:
//   1. never hand over a card that completes a set for the payee (when the
//      payee is known) — the timer auto-payer must not gift a win
//   2. never touch complete-set cards if any other combination covers the debt
//   3. never touch loose properties if the bank alone covers it
//   4. minimize value surrendered (no change is given — overpay is pure loss)
//   5. fewest cards (spending one big bill keeps small denominations for
//      exact change on future demands)
// Asset pools are small (≤ ~30 cards), so an exact subset-sum search is cheap.

import {
  ALL_COLORS,
  SET_DEFS,
  bankValueOf,
  cardById,
  type Card,
  type CardId,
  type SetColor,
} from "./cards";
import type { PropertySet } from "./state";

// Structural subset of Player/ProjectedPlayer so the client can call this on
// projected opponents too.
export type PayerAssets = {
  bank: CardId[];
  propertySets: PropertySet[];
};

export type PaymentSuggestion = {
  cardIds: CardId[];
  // Total bank value of the suggested cards.
  total: number;
  // Value surrendered beyond the debt (no change is given).
  overpay: number;
  // Unpayable remainder. > 0 means the payer is short and must surrender
  // every asset they own (wilds included) per the engine's all-assets rule.
  shortfall: number;
  usesProperties: boolean;
  breaksCompleteSet: boolean;
};

type Tier = 0 | 1 | 2; // 0 = bank, 1 = loose property, 2 = complete-set card

type Asset = { id: CardId; value: number; tier: Tier; gift: number };

// Best-known way to reach an exact offered sum: lexicographic cost of
// (gift count, complete-set value, loose-property value, card count).
// Extending two candidates with the same card shifts both costs identically,
// so keeping only the lexicographic minimum per sum preserves optimality.
type Node = { g: number; t2: number; t1: number; count: number; cards: CardId[] };

export function suggestPayment(
  payer: PayerAssets,
  amountOwed: number,
  // When the demander is known, cards that would complete one of their sets
  // are avoided above all else. Per-card against their current sets — a batch
  // that collectively completes a set is caught by paymentCompletesSets.
  payee?: PayerAssets,
): PaymentSuggestion {
  const owed = Math.max(0, amountOwed);

  const giftOf = (id: CardId): number =>
    payee && completesSetForReceiver(cardById(id), payee) ? 1 : 0;

  const allAssetIds: CardId[] = [...payer.bank];
  const tierOf = new Map<CardId, Tier>();
  const candidates: Asset[] = payer.bank.map((id) => {
    tierOf.set(id, 0);
    return { id, value: bankValueOf(cardById(id)), tier: 0 as Tier, gift: 0 };
  });
  for (const group of payer.propertySets) {
    const complete = group.cardIds.length >= SET_DEFS[group.color].complete;
    for (const id of group.cardIds) {
      allAssetIds.push(id);
      tierOf.set(id, complete ? 2 : 1);
      const value = bankValueOf(cardById(id));
      // Zero-value wilds can never help cover a debt; they only leave the
      // table in the surrender-everything case below.
      if (value > 0) candidates.push({ id, value, tier: complete ? 2 : 1, gift: giftOf(id) });
    }
  }

  const totalValue = candidates.reduce((sum, a) => sum + a.value, 0);

  if (owed === 0) {
    return finish([], owed, tierOf);
  }

  if (totalValue < owed) {
    // Short: the engine only accepts an under-payment when every asset is
    // offered, wilds included.
    return finish(allAssetIds, owed, tierOf);
  }

  // Deterministic input order so the timer auto-payer is reproducible.
  candidates.sort((a, b) => a.tier - b.tier || a.value - b.value || a.id.localeCompare(b.id));

  // Exact subset-sum over offered value. dp[sum] = best Node reaching sum.
  const dp: (Node | undefined)[] = new Array(totalValue + 1);
  dp[0] = { g: 0, t2: 0, t1: 0, count: 0, cards: [] };
  for (const asset of candidates) {
    // Descending sums: classic 0/1 knapsack, each card used at most once.
    for (let sum = totalValue - asset.value; sum >= 0; sum--) {
      const from = dp[sum];
      if (!from) continue;
      const next: Node = {
        g: from.g + asset.gift,
        t2: from.t2 + (asset.tier === 2 ? asset.value : 0),
        t1: from.t1 + (asset.tier === 1 ? asset.value : 0),
        count: from.count + 1,
        cards: [...from.cards, asset.id],
      };
      const existing = dp[sum + asset.value];
      if (!existing || lessThan(next, existing)) {
        dp[sum + asset.value] = next;
      }
    }
  }

  // Among all sums that cover the debt, prefer: fewest set-completing gifts,
  // least complete-set value, least loose-property value, least total
  // surrendered, fewest cards.
  let best: { sum: number; node: Node } | null = null;
  for (let sum = owed; sum <= totalValue; sum++) {
    const node = dp[sum];
    if (!node) continue;
    if (!best || sumLessThan(node, sum, best.node, best.sum)) {
      best = { sum, node };
    }
  }

  return finish(best?.node.cards ?? allAssetIds, owed, tierOf);
}

function lessThan(a: Node, b: Node): boolean {
  if (a.g !== b.g) return a.g < b.g;
  if (a.t2 !== b.t2) return a.t2 < b.t2;
  if (a.t1 !== b.t1) return a.t1 < b.t1;
  return a.count < b.count;
}

function sumLessThan(a: Node, aSum: number, b: Node, bSum: number): boolean {
  if (a.g !== b.g) return a.g < b.g;
  if (a.t2 !== b.t2) return a.t2 < b.t2;
  if (a.t1 !== b.t1) return a.t1 < b.t1;
  if (aSum !== bSum) return aSum < bSum;
  return a.count < b.count;
}

function finish(cardIds: CardId[], owed: number, tierOf: Map<CardId, Tier>): PaymentSuggestion {
  let total = 0;
  let usesProperties = false;
  let breaksCompleteSet = false;
  for (const id of cardIds) {
    total += bankValueOf(cardById(id));
    const tier = tierOf.get(id) ?? 0;
    if (tier >= 1) usesProperties = true;
    if (tier === 2) breaksCompleteSet = true;
  }
  return {
    cardIds,
    total,
    overpay: Math.max(0, total - owed),
    shortfall: Math.max(0, owed - total),
    usesProperties,
    breaksCompleteSet,
  };
}

// Colors the receiver would newly complete if handed this whole batch of
// cards at once. Catches what the per-card check can't: two oranges paid to
// a payee holding 1/3 orange complete their set even though each card alone
// looks safe. Wilds count toward every color they can represent (the
// receiver reassigns them freely on their turn), so this deliberately
// over-warns rather than under-warns.
export function paymentCompletesSets(cardIds: CardId[], receiver: PayerAssets): SetColor[] {
  const solids = new Map<SetColor, number>();
  let wild10s = 0;
  const wild2Colors = new Map<SetColor, number>();
  for (const id of cardIds) {
    const card = cardById(id);
    if (card.kind === "property") {
      solids.set(card.set, (solids.get(card.set) ?? 0) + 1);
    } else if (card.kind === "wild2") {
      for (const c of card.sets) wild2Colors.set(c, (wild2Colors.get(c) ?? 0) + 1);
    } else if (card.kind === "wild10") {
      wild10s++;
    }
  }
  const completed: SetColor[] = [];
  for (const color of ALL_COLORS) {
    const existing = receiver.propertySets.find((g) => g.color === color)?.cardIds.length ?? 0;
    const needed = SET_DEFS[color].complete;
    if (existing >= needed) continue; // already complete — nothing new gifted
    const incoming = (solids.get(color) ?? 0) + (wild2Colors.get(color) ?? 0) + wild10s;
    if (incoming > 0 && existing + incoming >= needed) completed.push(color);
  }
  return completed;
}

// Would handing `card` to `receiver` complete a set for them? Returns the
// color it would complete, or null. This is the "danger badge" signal in the
// payment UI — beginners hand opponents their winning card constantly.
export function completesSetForReceiver(card: Card, receiver: PayerAssets): SetColor | null {
  const colors: SetColor[] =
    card.kind === "property" ? [card.set] : card.kind === "wild2" ? [...card.sets] : card.kind === "wild10" ? ALL_COLORS : [];
  for (const color of colors) {
    const group = receiver.propertySets.find((g) => g.color === color);
    const len = group?.cardIds.length ?? 0;
    if (len === SET_DEFS[color].complete - 1 && len > 0) return color;
  }
  return null;
}
