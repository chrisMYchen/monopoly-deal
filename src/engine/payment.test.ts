import { describe, expect, it } from "vitest";

import { DECK, bankValueOf, cardById, type CardId, type SetColor } from "./cards";
import { completesSetForReceiver, paymentCompletesSets, suggestPayment } from "./payment";
import type { PropertySet } from "./state";

function findCard(predicate: (c: (typeof DECK)[number]) => boolean): string {
  const c = DECK.find(predicate);
  if (!c) throw new Error("test card not found");
  return c.id;
}

function allOf(predicate: (c: (typeof DECK)[number]) => boolean): string[] {
  return DECK.filter(predicate).map((c) => c.id);
}

function group(color: SetColor, cardIds: CardId[]): PropertySet {
  return { color, cardIds, hasHouse: false, hasHotel: false };
}

function assets(over: { bank?: CardId[]; propertySets?: PropertySet[] } = {}) {
  return { bank: over.bank ?? [], propertySets: over.propertySets ?? [] };
}

function totalOf(cardIds: CardId[]): number {
  return cardIds.reduce((sum, cid) => sum + bankValueOf(cardById(cid)), 0);
}

describe("suggestPayment", () => {
  const m1s = allOf((c) => c.kind === "money" && c.value === 1);
  const m1 = m1s[0]!;
  const m1b = m1s[1]!;
  const m2 = findCard((c) => c.kind === "money" && c.value === 2);
  const m3 = findCard((c) => c.kind === "money" && c.value === 3);
  const m4 = findCard((c) => c.kind === "money" && c.value === 4);
  const m5 = findCard((c) => c.kind === "money" && c.value === 5);

  it("finds exact change where cheapest-first greedy overpays", () => {
    // owe 4 with [1,1,3,5]: greedy cheapest-first pays 1+1+3=5; optimal is 1+3=4.
    const s = suggestPayment(assets({ bank: [m1, m1b, m3, m5] }), 4);
    expect(s.total).toBe(4);
    expect(s.overpay).toBe(0);
    expect(s.cardIds.sort()).toEqual([m1, m3].sort());
  });

  it("prefers fewer cards among equal-value exact payments", () => {
    // owe 4 with [4,1,3]: both {4} and {1,3} are exact; {4} keeps small change.
    const s = suggestPayment(assets({ bank: [m4, m1, m3] }), 4);
    expect(s.cardIds).toEqual([m4]);
  });

  it("prefers overpaying from bank over paying exact with a property", () => {
    // owe 4 with bank [$5] and a loose $4 green property: give the $5.
    const green = findCard((c) => c.kind === "property" && c.set === "green");
    const s = suggestPayment(
      assets({ bank: [m5], propertySets: [group("green", [green])] }),
      4,
    );
    expect(s.cardIds).toEqual([m5]);
    expect(s.overpay).toBe(1);
    expect(s.usesProperties).toBe(false);
  });

  it("uses loose properties before complete-set cards", () => {
    // owe 3, no bank. Loose red ($3) vs complete brown set ($1 each).
    const red = findCard((c) => c.kind === "property" && c.set === "red");
    const browns = allOf((c) => c.kind === "property" && c.set === "brown");
    const s = suggestPayment(
      assets({
        propertySets: [group("red", [red]), group("brown", [browns[0]!, browns[1]!])],
      }),
      3,
    );
    expect(s.cardIds).toEqual([red]);
    expect(s.breaksCompleteSet).toBe(false);
  });

  it("dips into a complete set only when nothing else covers", () => {
    const browns = allOf((c) => c.kind === "property" && c.set === "brown");
    const s = suggestPayment(
      assets({ bank: [m1], propertySets: [group("brown", [browns[0]!, browns[1]!])] }),
      2,
    );
    // bank $1 short of $2; must add a brown ($1) from the complete pair.
    expect(s.cardIds).toContain(m1);
    expect(s.breaksCompleteSet).toBe(true);
    expect(totalOf(s.cardIds)).toBeGreaterThanOrEqual(2);
  });

  it("never includes zero-value wilds when the debt can be covered", () => {
    const wild = findCard((c) => c.kind === "wild2");
    const s = suggestPayment(
      assets({ bank: [m5], propertySets: [group("orange", [wild])] }),
      5,
    );
    expect(s.cardIds).toEqual([m5]);
  });

  it("surrenders everything including wilds when short", () => {
    const wild = findCard((c) => c.kind === "wild2");
    const s = suggestPayment(
      assets({ bank: [m1], propertySets: [group("orange", [wild])] }),
      9,
    );
    expect(s.cardIds.sort()).toEqual([m1, wild].sort());
    expect(s.shortfall).toBe(8);
  });

  it("pays exact total without surrendering wilds when total equals debt", () => {
    const wild = findCard((c) => c.kind === "wild2");
    const red = findCard((c) => c.kind === "property" && c.set === "red");
    const s = suggestPayment(
      assets({ bank: [m2], propertySets: [group("red", [red, wild])] }),
      5,
    );
    // $2 bank + $3 red = $5 exact; the wild stays home.
    expect(s.cardIds.sort()).toEqual([m2, red].sort());
    expect(s.shortfall).toBe(0);
  });

  it("returns empty for a broke payer", () => {
    const s = suggestPayment(assets(), 5);
    expect(s.cardIds).toEqual([]);
    expect(s.shortfall).toBe(5);
  });

  it("returns an empty suggestion when nothing is owed", () => {
    const s = suggestPayment(assets({ bank: [m5, m1] }), 0);
    expect(s.cardIds).toEqual([]);
    expect(s.total).toBe(0);
    expect(s.overpay).toBe(0);
    expect(s.shortfall).toBe(0);
  });

  it("prefers overpaying with loose assets over exact change from a complete set", () => {
    // owe 4: exact = a $1 from the complete brown pair; alternative = two loose
    // green $4s? too big. Use: loose red $3 + bank $2 = $5 overpay beats the
    // brown-breaking exact $4. Tier (complete-set value) dominates the $1 overpay.
    const reds = allOf((c) => c.kind === "property" && c.set === "red");
    const browns = allOf((c) => c.kind === "property" && c.set === "brown");
    const s = suggestPayment(
      assets({
        bank: [m2],
        propertySets: [
          group("red", [reds[0]!]),
          group("brown", [browns[0]!, browns[1]!]),
        ],
      }),
      4,
    );
    expect(s.breaksCompleteSet).toBe(false);
    expect(s.cardIds.sort()).toEqual([m2, reds[0]!].sort());
    expect(s.overpay).toBe(1);
  });

  it("returned card order is stable across input permutations", () => {
    const a = suggestPayment(assets({ bank: [m5, m1, m3, m1b] }), 4);
    const b = suggestPayment(assets({ bank: [m1b, m3, m1, m5] }), 4);
    expect(a.cardIds).toEqual(b.cardIds);
  });

  it("avoids gifting the payee a set-completing card when an equal-value one exists", () => {
    // Two loose $2 pinks in the payer's bank-equivalent: one completes the
    // payee's 2/3 pink set, the other is a lone yellow. Owe $2 → solver must
    // pick the non-gifting one even though both are $2 and same tier.
    const pinks = allOf((c) => c.kind === "property" && c.set === "pink");
    const yellows = allOf((c) => c.kind === "property" && c.set === "yellow");
    const payee = assets({
      propertySets: [group("pink", [pinks[0]!, pinks[1]!])],
    });
    const s = suggestPayment(
      assets({
        propertySets: [group("pink", [pinks[2]!]), group("yellow", [yellows[0]!])],
      }),
      3, // pink value is 2, yellow is 3 — force a property-only pay of $3
      payee,
    );
    // The $3 yellow covers it alone without gifting; the $2 pink would gift.
    expect(s.cardIds).toEqual([yellows[0]!]);
  });
});

describe("paymentCompletesSets", () => {
  const oranges = allOf((c) => c.kind === "property" && c.set === "orange");
  const browns = allOf((c) => c.kind === "property" && c.set === "brown");

  it("flags a batch that collectively completes a set (per-card looks safe)", () => {
    // Payee holds 1/3 orange. Paying two oranges completes it — neither card
    // alone (1+1 < 3-1) trips the per-card completesSetForReceiver check.
    const payee = assets({ propertySets: [group("orange", [oranges[0]!])] });
    expect(completesSetForReceiver(cardById(oranges[1]!), payee)).toBeNull();
    expect(paymentCompletesSets([oranges[1]!, oranges[2]!], payee)).toEqual(["orange"]);
  });

  it("returns nothing when the batch stays short of completion", () => {
    const lightBlues = allOf((c) => c.kind === "property" && c.set === "lightBlue");
    const payee = assets({ propertySets: [group("lightBlue", [lightBlues[0]!])] });
    expect(paymentCompletesSets([lightBlues[1]!], payee)).toEqual([]);
  });

  it("ignores already-complete sets", () => {
    const payee = assets({ propertySets: [group("brown", [browns[0]!, browns[1]!])] });
    expect(paymentCompletesSets([browns[0]!], payee)).toEqual([]);
  });

  it("counts a wild toward completing a one-short set", () => {
    const wild = DECK.find((c) => c.kind === "wild2" && c.sets.includes("orange"));
    const payee = assets({ propertySets: [group("orange", [oranges[0]!, oranges[1]!])] });
    expect(paymentCompletesSets([wild!.id], payee)).toEqual(["orange"]);
  });
});

describe("completesSetForReceiver", () => {
  const browns = allOf((c) => c.kind === "property" && c.set === "brown");

  it("flags a property that would complete the receiver's set", () => {
    const receiver = assets({ propertySets: [group("brown", [browns[0]!])] });
    expect(completesSetForReceiver(cardById(browns[1]!), receiver)).toBe("brown");
  });

  it("returns null when the receiver's set stays incomplete", () => {
    const lightBlues = allOf((c) => c.kind === "property" && c.set === "lightBlue");
    const receiver = assets({ propertySets: [group("lightBlue", [lightBlues[0]!])] });
    expect(completesSetForReceiver(cardById(lightBlues[1]!), receiver)).toBeNull();
  });

  it("returns null when the receiver's set is already complete", () => {
    const receiver = assets({ propertySets: [group("brown", [browns[0]!, browns[1]!])] });
    expect(completesSetForReceiver(cardById(browns[2] ?? browns[1]!), receiver)).toBeNull();
  });

  it("checks both colors of a two-color wild", () => {
    const wild = DECK.find((c) => c.kind === "wild2" && c.sets[0] === "orange");
    const oranges = allOf((c) => c.kind === "property" && c.set === "orange");
    const receiver = assets({
      propertySets: [group("orange", [oranges[0]!, oranges[1]!])],
    });
    expect(completesSetForReceiver(wild!, receiver)).toBe("orange");
  });

  it("returns null for money cards", () => {
    const m1 = findCard((c) => c.kind === "money" && c.value === 1);
    const receiver = assets({ propertySets: [group("brown", [browns[0]!])] });
    expect(completesSetForReceiver(cardById(m1), receiver)).toBeNull();
  });
});
