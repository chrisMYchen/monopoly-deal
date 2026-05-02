import { describe, expect, it } from "vitest";
import {
  ALL_COLORS,
  DECK,
  SET_DEFS,
  STANDARD_COLORS,
  assertDeckTotals,
  bankValueOf,
  cardById,
} from "./cards";

describe("cards.ts deck composition", () => {
  it("totals 110 cards", () => {
    expect(DECK.length).toBe(110);
  });

  it("passes assertDeckTotals()", () => {
    expect(() => assertDeckTotals()).not.toThrow();
  });

  it("has exactly 20 money cards summing to $57M", () => {
    const money = DECK.filter((c) => c.kind === "money");
    expect(money.length).toBe(20);
    const total = money.reduce((s, c) => s + (c.kind === "money" ? c.value : 0), 0);
    expect(total).toBe(57);
  });

  it("has 28 solid properties matching SET_DEFS counts", () => {
    const properties = DECK.filter((c) => c.kind === "property");
    expect(properties.length).toBe(28);
    for (const color of ALL_COLORS) {
      const count = properties.filter((c) => c.kind === "property" && c.set === color).length;
      expect(count, `count for ${color}`).toBe(SET_DEFS[color].complete);
    }
  });

  it("has 9 dual-color wilds and 2 rainbow wilds", () => {
    const wild2 = DECK.filter((c) => c.kind === "wild2");
    const wild10 = DECK.filter((c) => c.kind === "wild10");
    expect(wild2.length).toBe(9);
    expect(wild10.length).toBe(2);
  });

  it("has 51 action cards including 15 rent cards (3 wild + 12 two-color)", () => {
    // Note: rent total is 15 in our distribution to make actions sum to 51 with
    // brown/lightBlue having 4 of its pair. Verify against physical rule sheet.
    const actions = DECK.filter((c) => c.kind === "action");
    expect(actions.length).toBe(51);
    const rents = actions.filter((c) => c.kind === "action" && c.action === "rent");
    expect(rents.length).toBe(15);
    const wildRents = rents.filter((c) => c.kind === "action" && c.rentSingleTarget === true);
    expect(wildRents.length).toBe(3);
  });

  it("has unique card ids", () => {
    const ids = new Set(DECK.map((c) => c.id));
    expect(ids.size).toBe(DECK.length);
  });

  it("STANDARD_COLORS excludes railroad and utility", () => {
    expect(STANDARD_COLORS).not.toContain("railroad");
    expect(STANDARD_COLORS).not.toContain("utility");
    expect(STANDARD_COLORS.length).toBe(8);
  });
});

describe("bankValueOf", () => {
  it("returns money value for money cards", () => {
    const m5 = DECK.find((c) => c.kind === "money" && c.value === 5)!;
    expect(bankValueOf(m5)).toBe(5);
  });

  it("returns property value for property cards", () => {
    const red = DECK.find((c) => c.kind === "property" && c.set === "red")!;
    expect(bankValueOf(red)).toBe(3);
  });

  it("returns action card value", () => {
    const dealBreaker = DECK.find((c) => c.kind === "action" && c.action === "dealBreaker")!;
    expect(bankValueOf(dealBreaker)).toBe(5);
  });

  it("returns 0 for wild2 (cannot be banked)", () => {
    const wild2 = DECK.find((c) => c.kind === "wild2")!;
    expect(bankValueOf(wild2)).toBe(0);
  });

  it("returns 0 for wild10 (cannot be banked)", () => {
    const wild10 = DECK.find((c) => c.kind === "wild10")!;
    expect(bankValueOf(wild10)).toBe(0);
  });
});

describe("cardById", () => {
  it("looks up cards by id", () => {
    const sample = DECK[0]!;
    expect(cardById(sample.id)).toBe(sample);
  });

  it("throws on unknown id", () => {
    expect(() => cardById("not-a-card")).toThrow();
  });
});
