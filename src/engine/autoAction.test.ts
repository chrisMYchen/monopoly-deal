import { describe, expect, it } from "vitest";

import { autoActionFor, onClockPlayerId, pickAutoDiscard, pickAutoPayment } from "./autoAction";
import { DECK, bankValueOf, cardById, type CardId } from "./cards";
import { applyAction, initialLobby } from "./reduce";
import type { GameState, Player } from "./state";

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

function injectBank(state: GameState, playerId: string, cardIds: CardId[]): GameState {
  return {
    ...state,
    players: state.players.map((p) => {
      if (p.id !== playerId) return p;
      return { ...p, bank: [...cardIds] };
    }),
  };
}

function injectTableau(
  state: GameState,
  playerId: string,
  groups: { color: import("./cards").SetColor; cardIds: CardId[] }[],
): GameState {
  return {
    ...state,
    players: state.players.map((p) => {
      if (p.id !== playerId) return p;
      return {
        ...p,
        tableau: groups.map((g) => ({
          color: g.color,
          cardIds: g.cardIds,
          hasHouse: false,
          hasHotel: false,
        })),
      };
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

describe("onClockPlayerId", () => {
  it("returns null in lobby", () => {
    expect(onClockPlayerId(initialLobby())).toBeNull();
  });

  it("returns active player when no pending state", () => {
    const s = newGame();
    expect(onClockPlayerId(s)).toBe("p1");
  });

  it("returns the discarder when awaiting discard-to-limit", () => {
    let s = newGame();
    // Stuff p1's hand to 9 cards so end-turn forces a discard.
    const moneys = allOf((c) => c.kind === "money").slice(0, 9);
    s = injectHand(s, "p1", moneys);
    s = applyAction(s, { type: "DRAW_TURN_START", playerId: "p1" });
    s = applyAction(s, { type: "END_TURN", playerId: "p1" });
    expect(s.pending?.kind).toBe("awaitDiscardToLimit");
    expect(onClockPlayerId(s)).toBe("p1");
  });

  it("returns the defender when awaiting Just Say No", () => {
    let s = newGame();
    const slyCard = findCard((c) => c.kind === "action" && c.action === "slyDeal");
    const red = findCard((c) => c.kind === "property" && c.set === "red");
    s = injectHand(s, "p1", [slyCard]);
    s = injectTableau(s, "p2", [{ color: "red", cardIds: [red] }]);
    s = applyAction(s, { type: "DRAW_TURN_START", playerId: "p1" });
    s = applyAction(s, {
      type: "PLAY_SLY_DEAL",
      playerId: "p1",
      cardId: slyCard,
      targetPlayerId: "p2",
      targetCardId: red,
    });
    expect(onClockPlayerId(s)).toBe("p2");
  });

  it("returns the source when JSN stack flips control back", () => {
    let s = newGame();
    const slyCard = findCard((c) => c.kind === "action" && c.action === "slyDeal");
    const jsn = findCard((c) => c.kind === "action" && c.action === "justSayNo");
    const red = findCard((c) => c.kind === "property" && c.set === "red");
    s = injectHand(s, "p1", [slyCard]);
    s = injectHand(s, "p2", [jsn]);
    s = injectTableau(s, "p2", [{ color: "red", cardIds: [red] }]);
    s = applyAction(s, { type: "DRAW_TURN_START", playerId: "p1" });
    s = applyAction(s, {
      type: "PLAY_SLY_DEAL",
      playerId: "p1",
      cardId: slyCard,
      targetPlayerId: "p2",
      targetCardId: red,
    });
    s = applyAction(s, { type: "RESPOND_JSN", playerId: "p2", play: true, cardId: jsn });
    // Now the source (p1) is on the clock to decide whether to counter-JSN.
    expect(onClockPlayerId(s)).toBe("p1");
  });
});

describe("autoActionFor", () => {
  it("returns DRAW_TURN_START when active player hasn't drawn", () => {
    const s = newGame();
    expect(autoActionFor(s)).toEqual({ type: "DRAW_TURN_START", playerId: "p1" });
  });

  it("returns END_TURN when active player has drawn but done nothing else", () => {
    let s = newGame();
    s = applyAction(s, { type: "DRAW_TURN_START", playerId: "p1" });
    expect(autoActionFor(s)).toEqual({ type: "END_TURN", playerId: "p1" });
  });

  it("returns RESPOND_JSN pass when defender is stalling", () => {
    let s = newGame();
    const slyCard = findCard((c) => c.kind === "action" && c.action === "slyDeal");
    const red = findCard((c) => c.kind === "property" && c.set === "red");
    s = injectHand(s, "p1", [slyCard]);
    s = injectTableau(s, "p2", [{ color: "red", cardIds: [red] }]);
    s = applyAction(s, { type: "DRAW_TURN_START", playerId: "p1" });
    s = applyAction(s, {
      type: "PLAY_SLY_DEAL",
      playerId: "p1",
      cardId: slyCard,
      targetPlayerId: "p2",
      targetCardId: red,
    });
    expect(autoActionFor(s)).toEqual({ type: "RESPOND_JSN", playerId: "p2", play: false });
  });

  it("returns a PAY action that the engine accepts", () => {
    let s = newGame();
    const debtCard = findCard((c) => c.kind === "action" && c.action === "debtCollector");
    const m1 = findCard((c) => c.kind === "money" && c.value === 1);
    const m2 = findCard((c) => c.kind === "money" && c.value === 2);
    const m5 = findCard((c) => c.kind === "money" && c.value === 5);
    s = injectHand(s, "p1", [debtCard]);
    s = injectBank(s, "p2", [m1, m2, m5]);
    s = applyAction(s, { type: "DRAW_TURN_START", playerId: "p1" });
    s = applyAction(s, {
      type: "PLAY_DEBT_COLLECTOR",
      playerId: "p1",
      cardId: debtCard,
      targetPlayerId: "p2",
    });
    s = applyAction(s, { type: "RESPOND_JSN", playerId: "p2", play: false });
    expect(s.pending?.kind).toBe("awaitPayment");

    const auto = autoActionFor(s);
    expect(auto?.type).toBe("PAY");
    // Apply it — the engine must accept the auto-action without error.
    const next = applyAction(s, auto!);
    expect(next.pending).toBeNull();
  });

  it("returns DISCARD_TO_LIMIT covering the overflow", () => {
    let s = newGame();
    const moneys = allOf((c) => c.kind === "money").slice(0, 9);
    s = injectHand(s, "p1", moneys);
    s = applyAction(s, { type: "DRAW_TURN_START", playerId: "p1" });
    s = applyAction(s, { type: "END_TURN", playerId: "p1" });
    expect(s.pending?.kind).toBe("awaitDiscardToLimit");

    const auto = autoActionFor(s);
    expect(auto?.type).toBe("DISCARD_TO_LIMIT");
    if (auto?.type !== "DISCARD_TO_LIMIT") throw new Error("expected DISCARD_TO_LIMIT");
    // 9 starting + 2 drawn = 11; hand limit is 7, so overflow = 4.
    expect(auto.cardIds.length).toBe(4);
    const next = applyAction(s, auto);
    expect(next.pending).toBeNull();
    // Turn advanced.
    expect(next.currentTurn).toBe(1);
  });

  it("returns null in lobby (no game in progress)", () => {
    expect(autoActionFor(initialLobby())).toBeNull();
  });
});

describe("pickAutoPayment", () => {
  function makePayer(over: Partial<Player> = {}): Player {
    return {
      id: "x",
      name: "X",
      hand: [],
      bank: [],
      tableau: [],
      connected: true,
      ...over,
    };
  }

  it("pays bank cards lowest-value-first to cover the debt", () => {
    const m1 = findCard((c) => c.kind === "money" && c.value === 1);
    const m2 = findCard((c) => c.kind === "money" && c.value === 2);
    const m5 = findCard((c) => c.kind === "money" && c.value === 5);
    const payer = makePayer({ bank: [m5, m1, m2] });
    const picked = pickAutoPayment(payer, 3);
    const total = picked.reduce((sum, cid) => sum + bankValueOf(cardById(cid)), 0);
    expect(total).toBeGreaterThanOrEqual(3);
    // Ideally only 1 + 2 = 3, no $5 needed.
    expect(picked).toContain(m1);
    expect(picked).toContain(m2);
    expect(picked).not.toContain(m5);
  });

  it("pays everything when total assets are short of debt", () => {
    const m1 = findCard((c) => c.kind === "money" && c.value === 1);
    const payer = makePayer({ bank: [m1] });
    const picked = pickAutoPayment(payer, 99);
    expect(picked).toEqual([m1]);
  });

  it("dips into properties only after exhausting the bank", () => {
    const m1 = findCard((c) => c.kind === "money" && c.value === 1);
    const red = findCard((c) => c.kind === "property" && c.set === "red");
    const payer = makePayer({
      bank: [m1],
      tableau: [{ color: "red", cardIds: [red], hasHouse: false, hasHotel: false }],
    });
    const picked = pickAutoPayment(payer, 4);
    // bank = $1, property = $3, total = $4, debt = $4 → all assets paid.
    expect(picked).toContain(m1);
    expect(picked).toContain(red);
  });
});

describe("pickAutoDiscard", () => {
  it("picks N lowest-value cards", () => {
    const m1 = findCard((c) => c.kind === "money" && c.value === 1);
    const m2 = findCard((c) => c.kind === "money" && c.value === 2);
    const m5 = findCard((c) => c.kind === "money" && c.value === 5);
    const picked = pickAutoDiscard([m5, m1, m2], 2);
    expect(picked).toContain(m1);
    expect(picked).toContain(m2);
    expect(picked).not.toContain(m5);
  });

  it("is deterministic when values tie", () => {
    const m1a = findCard((c) => c.kind === "money" && c.value === 1);
    const m1b = findCard((c) => c.kind === "money" && c.value === 1 && c.id !== m1a);
    const a = pickAutoDiscard([m1b, m1a], 1);
    const b = pickAutoDiscard([m1a, m1b], 1);
    expect(a).toEqual(b);
  });
});

describe("UPDATE_SETTINGS", () => {
  it("changes the timer in lobby", () => {
    let s = initialLobby();
    expect(s.settings.turnTimerSeconds).toBe(60);
    s = applyAction(s, {
      type: "UPDATE_SETTINGS",
      playerId: "anyone",
      settings: { turnTimerSeconds: 30 },
    });
    expect(s.settings.turnTimerSeconds).toBe(30);
  });

  it("accepts null (off)", () => {
    let s = initialLobby();
    s = applyAction(s, {
      type: "UPDATE_SETTINGS",
      playerId: "anyone",
      settings: { turnTimerSeconds: null },
    });
    expect(s.settings.turnTimerSeconds).toBeNull();
  });

  it("rejects out-of-range values", () => {
    const s = initialLobby();
    expect(() =>
      applyAction(s, {
        type: "UPDATE_SETTINGS",
        playerId: "anyone",
        settings: { turnTimerSeconds: 17 },
      }),
    ).toThrow();
  });

  it("rejects updates after game starts", () => {
    const s = newGame();
    expect(() =>
      applyAction(s, {
        type: "UPDATE_SETTINGS",
        playerId: "p1",
        settings: { turnTimerSeconds: 30 },
      }),
    ).toThrow();
  });
});
