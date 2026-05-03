import { describe, expect, it } from "vitest";

import { DECK, type CardId, type SetColor } from "./cards";
import { applyAction, initialLobby, rentFor } from "./reduce";
import type { GameState, Player } from "./state";

// ---------------------------------------------------------------------------
// Test helpers (duplicated minimally from reduce.test.ts to keep tests focused)
// ---------------------------------------------------------------------------

function newGame(playerCount = 3, seed = 42): GameState {
  const players = Array.from({ length: playerCount }, (_, i) => ({
    id: `p${i + 1}`,
    name: `P${i + 1}`,
  }));
  return applyAction(initialLobby(), {
    type: "START_GAME",
    rngSeed: seed,
    players,
  });
}

function injectHand(state: GameState, playerId: string, cardIds: CardId[]): GameState {
  return {
    ...state,
    players: state.players.map((p) => {
      if (p.id !== playerId) return p;
      return { ...p, hand: [...cardIds] };
    }),
    drawPile: state.drawPile.filter((c) => !cardIds.includes(c)),
    discardPile: state.discardPile.filter((c) => !cardIds.includes(c)),
  };
}

// Inject a fully-built property set (skipping the play flow). Used to set up
// scenarios that need pre-existing properties to test action targeting.
function injectPropertySets(
  state: GameState,
  playerId: string,
  groups: { color: SetColor; cardIds: CardId[]; hasHouse?: boolean; hasHotel?: boolean }[],
): GameState {
  return {
    ...state,
    players: state.players.map((p) => {
      if (p.id !== playerId) return p;
      return {
        ...p,
        propertySets: groups.map((g) => ({
          color: g.color,
          cardIds: g.cardIds,
          hasHouse: g.hasHouse ?? false,
          hasHotel: g.hasHotel ?? false,
        })),
      };
    }),
  };
}

function injectBank(state: GameState, playerId: string, cardIds: CardId[]): GameState {
  return {
    ...state,
    players: state.players.map((p) => {
      if (p.id !== playerId) return p;
      return { ...p, bank: [...cardIds] };
    }),
  };
}

function findCard(predicate: (c: (typeof DECK)[number]) => boolean): string {
  const c = DECK.find(predicate);
  if (!c) throw new Error("test card not found");
  return c.id;
}

function allOf(predicate: (c: (typeof DECK)[number]) => boolean): string[] {
  return DECK.filter(predicate).map((c) => c.id);
}

function getPlayer(s: GameState, id: string): Player {
  const p = s.players.find((p) => p.id === id);
  if (!p) throw new Error(`no player ${id}`);
  return p;
}

// ---------------------------------------------------------------------------
// SLY DEAL
// ---------------------------------------------------------------------------

describe("PLAY_SLY_DEAL", () => {
  it("steals a single property from an opponent (no JSN)", () => {
    let s = newGame();
    const slyCard = findCard((c) => c.kind === "action" && c.action === "slyDeal");
    const red = findCard((c) => c.kind === "property" && c.set === "red");
    s = injectHand(s, "p1", [slyCard]);
    s = injectPropertySets(s, "p2", [{ color: "red", cardIds: [red] }]);
    s = applyAction(s, { type: "DRAW_TURN_START", playerId: "p1" });
    s = applyAction(s, {
      type: "PLAY_SLY_DEAL",
      playerId: "p1",
      cardId: slyCard,
      targetPlayerId: "p2",
      targetCardId: red,
    });
    // pending awaitJustSayNo for p2; p2 passes.
    expect(s.pending?.kind).toBe("awaitJustSayNo");
    s = applyAction(s, { type: "RESPOND_JSN", playerId: "p2", play: false });
    expect(s.pending).toBeNull();
    expect(getPlayer(s, "p2").propertySets.length).toBe(0);
    expect(getPlayer(s, "p1").propertySets[0]?.cardIds).toEqual([red]);
    expect(s.discardPile).toContain(slyCard);
    expect(s.playsRemaining).toBe(2);
  });

  it("can be canceled by Just Say No", () => {
    let s = newGame();
    const slyCard = findCard((c) => c.kind === "action" && c.action === "slyDeal");
    const jsn = findCard((c) => c.kind === "action" && c.action === "justSayNo");
    const red = findCard((c) => c.kind === "property" && c.set === "red");
    s = injectHand(s, "p1", [slyCard]);
    s = injectHand(s, "p2", [jsn]);
    s = injectPropertySets(s, "p2", [{ color: "red", cardIds: [red] }]);
    s = applyAction(s, { type: "DRAW_TURN_START", playerId: "p1" });
    s = applyAction(s, {
      type: "PLAY_SLY_DEAL",
      playerId: "p1",
      cardId: slyCard,
      targetPlayerId: "p2",
      targetCardId: red,
    });
    s = applyAction(s, { type: "RESPOND_JSN", playerId: "p2", play: true, cardId: jsn });
    // Now source can JSN-back; passes.
    s = applyAction(s, { type: "RESPOND_JSN", playerId: "p1", play: false });
    expect(s.pending).toBeNull();
    // Property stays with p2.
    expect(getPlayer(s, "p2").propertySets[0]?.cardIds).toEqual([red]);
    expect(getPlayer(s, "p1").propertySets.length).toBe(0);
    expect(s.discardPile).toContain(jsn);
    expect(s.discardPile).toContain(slyCard);
  });

  it("JSN-on-JSN keeps the action in flight (chain depth 2)", () => {
    let s = newGame();
    const slyCard = findCard((c) => c.kind === "action" && c.action === "slyDeal");
    const jsns = allOf((c) => c.kind === "action" && c.action === "justSayNo");
    const red = findCard((c) => c.kind === "property" && c.set === "red");
    s = injectHand(s, "p1", [slyCard, jsns[0]!]);
    s = injectHand(s, "p2", [jsns[1]!]);
    s = injectPropertySets(s, "p2", [{ color: "red", cardIds: [red] }]);
    s = applyAction(s, { type: "DRAW_TURN_START", playerId: "p1" });
    s = applyAction(s, {
      type: "PLAY_SLY_DEAL",
      playerId: "p1",
      cardId: slyCard,
      targetPlayerId: "p2",
      targetCardId: red,
    });
    s = applyAction(s, { type: "RESPOND_JSN", playerId: "p2", play: true, cardId: jsns[1]! });
    s = applyAction(s, { type: "RESPOND_JSN", playerId: "p1", play: true, cardId: jsns[0]! });
    // Now p2 has no more JSNs and must pass.
    s = applyAction(s, { type: "RESPOND_JSN", playerId: "p2", play: false });
    expect(s.pending).toBeNull();
    // Property stolen to p1 (jsnStack length = 2 = even, action proceeds).
    expect(getPlayer(s, "p1").propertySets[0]?.cardIds).toEqual([red]);
  });

  it("rejects sly-dealing a complete set", () => {
    let s = newGame();
    const slyCard = findCard((c) => c.kind === "action" && c.action === "slyDeal");
    const browns = allOf((c) => c.kind === "property" && c.set === "brown"); // 2 = complete
    s = injectHand(s, "p1", [slyCard]);
    s = injectPropertySets(s, "p2", [{ color: "brown", cardIds: browns }]);
    s = applyAction(s, { type: "DRAW_TURN_START", playerId: "p1" });
    expect(() =>
      applyAction(s, {
        type: "PLAY_SLY_DEAL",
        playerId: "p1",
        cardId: slyCard,
        targetPlayerId: "p2",
        targetCardId: browns[0]!,
      }),
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// FORCED DEAL
// ---------------------------------------------------------------------------

describe("PLAY_FORCED_DEAL", () => {
  it("swaps two properties between players", () => {
    let s = newGame();
    const fdCard = findCard((c) => c.kind === "action" && c.action === "forcedDeal");
    const myRed = allOf((c) => c.kind === "property" && c.set === "red")[0]!;
    const theirGreen = allOf((c) => c.kind === "property" && c.set === "green")[0]!;
    s = injectHand(s, "p1", [fdCard]);
    s = injectPropertySets(s, "p1", [{ color: "red", cardIds: [myRed] }]);
    s = injectPropertySets(s, "p2", [{ color: "green", cardIds: [theirGreen] }]);
    s = applyAction(s, { type: "DRAW_TURN_START", playerId: "p1" });
    s = applyAction(s, {
      type: "PLAY_FORCED_DEAL",
      playerId: "p1",
      cardId: fdCard,
      myCardId: myRed,
      targetPlayerId: "p2",
      targetCardId: theirGreen,
    });
    s = applyAction(s, { type: "RESPOND_JSN", playerId: "p2", play: false });
    const p1 = getPlayer(s, "p1");
    const p2 = getPlayer(s, "p2");
    expect(p1.propertySets.find((g) => g.color === "green")?.cardIds).toEqual([theirGreen]);
    expect(p2.propertySets.find((g) => g.color === "red")?.cardIds).toEqual([myRed]);
  });
});

// ---------------------------------------------------------------------------
// DEAL BREAKER
// ---------------------------------------------------------------------------

describe("PLAY_DEAL_BREAKER", () => {
  it("steals a complete set", () => {
    let s = newGame();
    const dbCard = findCard((c) => c.kind === "action" && c.action === "dealBreaker");
    const browns = allOf((c) => c.kind === "property" && c.set === "brown"); // 2 = complete
    s = injectHand(s, "p1", [dbCard]);
    s = injectPropertySets(s, "p2", [{ color: "brown", cardIds: browns }]);
    s = applyAction(s, { type: "DRAW_TURN_START", playerId: "p1" });
    s = applyAction(s, {
      type: "PLAY_DEAL_BREAKER",
      playerId: "p1",
      cardId: dbCard,
      targetPlayerId: "p2",
      targetColor: "brown",
      targetGroupIdx: 0,
    });
    s = applyAction(s, { type: "RESPOND_JSN", playerId: "p2", play: false });
    expect(getPlayer(s, "p2").propertySets).toEqual([]);
    expect(getPlayer(s, "p1").propertySets[0]?.cardIds).toEqual(browns);
  });

  it("rejects targeting an incomplete set", () => {
    let s = newGame();
    const dbCard = findCard((c) => c.kind === "action" && c.action === "dealBreaker");
    const browns = allOf((c) => c.kind === "property" && c.set === "brown");
    s = injectHand(s, "p1", [dbCard]);
    s = injectPropertySets(s, "p2", [{ color: "brown", cardIds: [browns[0]!] }]);
    s = applyAction(s, { type: "DRAW_TURN_START", playerId: "p1" });
    expect(() =>
      applyAction(s, {
        type: "PLAY_DEAL_BREAKER",
        playerId: "p1",
        cardId: dbCard,
        targetPlayerId: "p2",
        targetColor: "brown",
        targetGroupIdx: 0,
      }),
    ).toThrow();
  });

  it("steals an overcomplete set as one unit (every extra card moves with it)", () => {
    // Mirrors the user-confirmed semantics: a set with wildcards-plus-extras
    // (4/3, 5/3) is one set. Deal Breaker must take the whole pile.
    let s = newGame();
    const dbCard = findCard((c) => c.kind === "action" && c.action === "dealBreaker");
    const oranges = allOf((c) => c.kind === "property" && c.set === "orange");
    const orangeWilds = allOf(
      (c) => c.kind === "wild2" && c.sets.includes("orange") && c.sets.includes("pink"),
    );
    const overcomplete = [...oranges, ...orangeWilds]; // 5 cards, complete=3
    s = injectHand(s, "p1", [dbCard]);
    s = injectPropertySets(s, "p2", [{ color: "orange", cardIds: overcomplete }]);
    s = applyAction(s, { type: "DRAW_TURN_START", playerId: "p1" });
    s = applyAction(s, {
      type: "PLAY_DEAL_BREAKER",
      playerId: "p1",
      cardId: dbCard,
      targetPlayerId: "p2",
      targetColor: "orange",
      targetGroupIdx: 0,
    });
    s = applyAction(s, { type: "RESPOND_JSN", playerId: "p2", play: false });
    expect(getPlayer(s, "p2").propertySets).toEqual([]);
    const stolen = getPlayer(s, "p1").propertySets;
    expect(stolen.length).toBe(1);
    expect(stolen[0]!.color).toBe("orange");
    expect(stolen[0]!.cardIds.length).toBe(5);
    for (const cid of overcomplete) expect(stolen[0]!.cardIds).toContain(cid);
  });
});

// ---------------------------------------------------------------------------
// DEBT COLLECTOR + PAY
// ---------------------------------------------------------------------------

describe("PLAY_DEBT_COLLECTOR + PAY", () => {
  it("forces opponent to pay $5M with a $5 bill", () => {
    let s = newGame();
    const dcCard = findCard((c) => c.kind === "action" && c.action === "debtCollector");
    const m5 = findCard((c) => c.kind === "money" && c.value === 5);
    s = injectHand(s, "p1", [dcCard]);
    s = injectBank(s, "p2", [m5]);
    s = applyAction(s, { type: "DRAW_TURN_START", playerId: "p1" });
    s = applyAction(s, {
      type: "PLAY_DEBT_COLLECTOR",
      playerId: "p1",
      cardId: dcCard,
      targetPlayerId: "p2",
    });
    s = applyAction(s, { type: "RESPOND_JSN", playerId: "p2", play: false });
    expect(s.pending?.kind).toBe("awaitPayment");
    s = applyAction(s, { type: "PAY", playerId: "p2", cardIds: [m5] });
    expect(s.pending).toBeNull();
    expect(getPlayer(s, "p1").bank).toContain(m5);
    expect(getPlayer(s, "p2").bank).toEqual([]);
  });

  it("forgives debt when payer is bankrupt", () => {
    let s = newGame();
    const dcCard = findCard((c) => c.kind === "action" && c.action === "debtCollector");
    s = injectHand(s, "p1", [dcCard]);
    s = injectHand(s, "p2", []);
    s = injectBank(s, "p2", []);
    s = applyAction(s, { type: "DRAW_TURN_START", playerId: "p1" });
    s = applyAction(s, {
      type: "PLAY_DEBT_COLLECTOR",
      playerId: "p1",
      cardId: dcCard,
      targetPlayerId: "p2",
    });
    s = applyAction(s, { type: "RESPOND_JSN", playerId: "p2", play: false });
    s = applyAction(s, { type: "PAY", playerId: "p2", cardIds: [] });
    expect(s.pending).toBeNull();
    expect(getPlayer(s, "p1").bank).toEqual([]);
  });

  it("allows payment with property when bank insufficient", () => {
    let s = newGame();
    const dcCard = findCard((c) => c.kind === "action" && c.action === "debtCollector");
    const red = findCard((c) => c.kind === "property" && c.set === "red"); // $3M
    const m2 = findCard((c) => c.kind === "money" && c.value === 2);
    s = injectHand(s, "p1", [dcCard]);
    s = injectBank(s, "p2", [m2]);
    s = injectPropertySets(s, "p2", [{ color: "red", cardIds: [red] }]);
    s = applyAction(s, { type: "DRAW_TURN_START", playerId: "p1" });
    s = applyAction(s, {
      type: "PLAY_DEBT_COLLECTOR",
      playerId: "p1",
      cardId: dcCard,
      targetPlayerId: "p2",
    });
    s = applyAction(s, { type: "RESPOND_JSN", playerId: "p2", play: false });
    s = applyAction(s, { type: "PAY", playerId: "p2", cardIds: [m2, red] });
    expect(s.pending).toBeNull();
    expect(getPlayer(s, "p1").bank).toContain(m2);
    expect(getPlayer(s, "p1").propertySets.find((g) => g.color === "red")?.cardIds).toEqual([red]);
    expect(getPlayer(s, "p2").bank).toEqual([]);
    expect(getPlayer(s, "p2").propertySets).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// BIRTHDAY
// ---------------------------------------------------------------------------

describe("PLAY_BIRTHDAY", () => {
  it("collects $2 from each opponent (one at a time)", () => {
    let s = newGame(3); // p1 source; p2 and p3 owe $2 each
    const bdCard = findCard((c) => c.kind === "action" && c.action === "birthday");
    const m2s = allOf((c) => c.kind === "money" && c.value === 2);
    s = injectHand(s, "p1", [bdCard]);
    s = injectBank(s, "p2", [m2s[0]!]);
    s = injectBank(s, "p3", [m2s[1]!]);
    s = applyAction(s, { type: "DRAW_TURN_START", playerId: "p1" });
    s = applyAction(s, { type: "PLAY_BIRTHDAY", playerId: "p1", cardId: bdCard });
    // p2's JSN window first
    expect(s.pending?.kind).toBe("awaitJustSayNo");
    s = applyAction(s, { type: "RESPOND_JSN", playerId: "p2", play: false });
    expect(s.pending?.kind).toBe("awaitPayment");
    s = applyAction(s, { type: "PAY", playerId: "p2", cardIds: [m2s[0]!] });
    // Now p3's JSN window
    expect(s.pending?.kind).toBe("awaitJustSayNo");
    s = applyAction(s, { type: "RESPOND_JSN", playerId: "p3", play: false });
    expect(s.pending?.kind).toBe("awaitPayment");
    s = applyAction(s, { type: "PAY", playerId: "p3", cardIds: [m2s[1]!] });
    expect(s.pending).toBeNull();
    expect(getPlayer(s, "p1").bank.length).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// RENT (2-color and ★ wild)
// ---------------------------------------------------------------------------

describe("PLAY_RENT", () => {
  it("charges 2-color rent against all opponents", () => {
    let s = newGame(3);
    const reds = allOf((c) => c.kind === "property" && c.set === "red"); // 3 -> complete; ladder $6
    const rentCard = findCard(
      (c) =>
        c.kind === "action" &&
        c.action === "rent" &&
        !c.rentSingleTarget &&
        c.rentSets?.includes("red") === true,
    );
    const m5 = findCard((c) => c.kind === "money" && c.value === 5);
    const m4 = findCard((c) => c.kind === "money" && c.value === 4);
    s = injectHand(s, "p1", [rentCard]);
    s = injectPropertySets(s, "p1", [{ color: "red", cardIds: reds }]);
    s = injectBank(s, "p2", [m5]);
    s = injectBank(s, "p3", [m4]);
    expect(rentFor(getPlayer(s, "p1"), "red")).toBe(6);
    s = applyAction(s, { type: "DRAW_TURN_START", playerId: "p1" });
    s = applyAction(s, { type: "PLAY_RENT", playerId: "p1", cardId: rentCard, color: "red" });
    // p2 first
    s = applyAction(s, { type: "RESPOND_JSN", playerId: "p2", play: false });
    expect(s.pending?.kind).toBe("awaitPayment");
    s = applyAction(s, { type: "PAY", playerId: "p2", cardIds: [m5] }); // $5 covers $6? no — must offer all
    // p2 only had $5, less than $6 owed; required to give all assets
    expect(getPlayer(s, "p2").bank).toEqual([]);
    // p3 next
    s = applyAction(s, { type: "RESPOND_JSN", playerId: "p3", play: false });
    s = applyAction(s, { type: "PAY", playerId: "p3", cardIds: [m4] });
    expect(s.pending).toBeNull();
    expect(getPlayer(s, "p1").bank).toContain(m5);
    expect(getPlayer(s, "p1").bank).toContain(m4);
  });

  it("charges ★ wild rent against a chosen single target", () => {
    let s = newGame(3);
    const greens = allOf((c) => c.kind === "property" && c.set === "green").slice(0, 2);
    // Wild ★ rent
    const wildRent = findCard(
      (c) => c.kind === "action" && c.action === "rent" && c.rentSingleTarget === true,
    );
    const m4 = findCard((c) => c.kind === "money" && c.value === 4);
    s = injectHand(s, "p1", [wildRent]);
    s = injectPropertySets(s, "p1", [{ color: "green", cardIds: greens }]);
    s = injectBank(s, "p3", [m4]);
    s = applyAction(s, { type: "DRAW_TURN_START", playerId: "p1" });
    s = applyAction(s, {
      type: "PLAY_RENT",
      playerId: "p1",
      cardId: wildRent,
      color: "green",
      singleTargetId: "p3",
    });
    // Only p3 in the JSN queue — p2 untouched
    expect(s.pending?.kind).toBe("awaitJustSayNo");
    s = applyAction(s, { type: "RESPOND_JSN", playerId: "p3", play: false });
    s = applyAction(s, { type: "PAY", playerId: "p3", cardIds: [m4] });
    expect(s.pending).toBeNull();
    expect(getPlayer(s, "p1").bank).toContain(m4);
    // p2 unaffected
    expect(getPlayer(s, "p2").bank).toEqual([]);
  });

  it("Double The Rent doubles the amount and consumes 2 plays", () => {
    let s = newGame(2);
    const greens = allOf((c) => c.kind === "property" && c.set === "green").slice(0, 2); // 2/3 -> $4 ladder
    const rentCard = findCard(
      (c) =>
        c.kind === "action" &&
        c.action === "rent" &&
        !c.rentSingleTarget &&
        c.rentSets?.includes("green") === true,
    );
    const doubleCard = findCard((c) => c.kind === "action" && c.action === "doubleRent");
    const m10 = findCard((c) => c.kind === "money" && c.value === 10);
    s = injectHand(s, "p1", [rentCard, doubleCard]);
    s = injectPropertySets(s, "p1", [{ color: "green", cardIds: greens }]);
    s = injectBank(s, "p2", [m10]);
    s = applyAction(s, { type: "DRAW_TURN_START", playerId: "p1" });
    const beforePlays = s.playsRemaining;
    s = applyAction(s, {
      type: "PLAY_RENT",
      playerId: "p1",
      cardId: rentCard,
      color: "green",
      doubleRentCardIds: [doubleCard],
    });
    s = applyAction(s, { type: "RESPOND_JSN", playerId: "p2", play: false });
    s = applyAction(s, { type: "PAY", playerId: "p2", cardIds: [m10] });
    // Owed = 4 * 2 = $8M. Bank had $10 — overpay, no change.
    expect(getPlayer(s, "p1").bank).toContain(m10);
    expect(s.playsRemaining).toBe(beforePlays - 2);
  });
});
