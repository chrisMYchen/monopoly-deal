import { beforeEach, describe, expect, it } from "vitest";

import { DECK, SET_DEFS, type CardId, type SetColor } from "./cards";
import { applyAction, initialLobby, isComplete, rentFor } from "./reduce";
import type { GameState, Player } from "./state";

// ---------------------------------------------------------------------------
// Test helpers
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

// Force a deterministic hand on a player by stealing cards from the draw pile.
// Returns the modified state. Used in tests that need a specific card type
// without fishing through the random shuffle.
function injectHand(state: GameState, playerId: string, cardIds: CardId[]): GameState {
  return {
    ...state,
    players: state.players.map((p) => {
      if (p.id !== playerId) return p;
      // Remove these from drawPile / discardPile / other hands first to avoid duplicates.
      return { ...p, hand: [...cardIds] };
    }),
    drawPile: state.drawPile.filter((c) => !cardIds.includes(c)),
    discardPile: state.discardPile.filter((c) => !cardIds.includes(c)),
  };
}

function findCard(predicate: (c: (typeof DECK)[number]) => boolean): string {
  const c = DECK.find(predicate);
  if (!c) throw new Error("test card not found");
  return c.id;
}

function allCardsOfKind(predicate: (c: (typeof DECK)[number]) => boolean): string[] {
  return DECK.filter(predicate).map((c) => c.id);
}

function getPlayer(s: GameState, id: string): Player {
  const p = s.players.find((p) => p.id === id);
  if (!p) throw new Error(`no player ${id}`);
  return p;
}

// ---------------------------------------------------------------------------
// START_GAME
// ---------------------------------------------------------------------------

describe("START_GAME", () => {
  it("deals 5 cards to each of 3 players, leaves 95 in draw pile", () => {
    const s = newGame(3);
    expect(s.phase).toBe("playing");
    expect(s.players.length).toBe(3);
    for (const p of s.players) expect(p.hand.length).toBe(5);
    expect(s.drawPile.length).toBe(110 - 15);
    expect(s.currentTurn).toBe(0);
    expect(s.playsRemaining).toBe(3);
    expect(s.hasDrawnThisTurn).toBe(false);
  });

  it("rejects fewer than 2 or more than 5 players", () => {
    expect(() =>
      applyAction(initialLobby(), {
        type: "START_GAME",
        rngSeed: 1,
        players: [{ id: "p1", name: "P1" }],
      }),
    ).toThrow();
    expect(() =>
      applyAction(initialLobby(), {
        type: "START_GAME",
        rngSeed: 1,
        players: Array.from({ length: 6 }, (_, i) => ({ id: `p${i}`, name: `P${i}` })),
      }),
    ).toThrow();
  });

  it("produces deterministic hands for the same seed", () => {
    const a = newGame(3, 99);
    const b = newGame(3, 99);
    expect(a.players[0]!.hand).toEqual(b.players[0]!.hand);
  });

  it("produces different hands for different seeds", () => {
    const a = newGame(3, 1);
    const b = newGame(3, 2);
    expect(a.players[0]!.hand).not.toEqual(b.players[0]!.hand);
  });
});

// ---------------------------------------------------------------------------
// Turn-start draw
// ---------------------------------------------------------------------------

describe("DRAW_TURN_START", () => {
  it("draws 2 by default", () => {
    let s = newGame();
    s = applyAction(s, { type: "DRAW_TURN_START", playerId: "p1" });
    expect(getPlayer(s, "p1").hand.length).toBe(7);
    expect(s.hasDrawnThisTurn).toBe(true);
  });

  it("draws 5 if hand was empty at start of turn", () => {
    let s = newGame();
    s = injectHand(s, "p1", []);
    s = applyAction(s, { type: "DRAW_TURN_START", playerId: "p1" });
    expect(getPlayer(s, "p1").hand.length).toBe(5);
  });

  it("rejects double-draw", () => {
    let s = newGame();
    s = applyAction(s, { type: "DRAW_TURN_START", playerId: "p1" });
    expect(() =>
      applyAction(s, { type: "DRAW_TURN_START", playerId: "p1" }),
    ).toThrow();
  });

  it("rejects out-of-turn draw", () => {
    const s = newGame();
    expect(() =>
      applyAction(s, { type: "DRAW_TURN_START", playerId: "p2" }),
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// PLAY_PROPERTY
// ---------------------------------------------------------------------------

describe("PLAY_PROPERTY", () => {
  it("places a solid property into its color group", () => {
    let s = newGame();
    const red = findCard((c) => c.kind === "property" && c.set === "red");
    s = injectHand(s, "p1", [red]);
    s = applyAction(s, { type: "DRAW_TURN_START", playerId: "p1" });
    s = applyAction(s, {
      type: "PLAY_PROPERTY",
      playerId: "p1",
      cardId: red,
      assignedColor: "red",
    });
    const p1 = getPlayer(s, "p1");
    expect(p1.propertySets.length).toBe(1);
    expect(p1.propertySets[0]!.color).toBe("red");
    expect(p1.propertySets[0]!.cardIds).toEqual([red]);
    expect(s.playsRemaining).toBe(2);
  });

  it("rejects solid property played to wrong color", () => {
    let s = newGame();
    const red = findCard((c) => c.kind === "property" && c.set === "red");
    s = injectHand(s, "p1", [red]);
    s = applyAction(s, { type: "DRAW_TURN_START", playerId: "p1" });
    expect(() =>
      applyAction(s, {
        type: "PLAY_PROPERTY",
        playerId: "p1",
        cardId: red,
        assignedColor: "green",
      }),
    ).toThrow();
  });

  it("places a wild2 to either of its two colors", () => {
    let s = newGame();
    const wild = findCard(
      (c) =>
        c.kind === "wild2" &&
        c.sets[0] === "orange" &&
        c.sets[1] === "pink",
    );
    s = injectHand(s, "p1", [wild]);
    s = applyAction(s, { type: "DRAW_TURN_START", playerId: "p1" });
    s = applyAction(s, {
      type: "PLAY_PROPERTY",
      playerId: "p1",
      cardId: wild,
      assignedColor: "pink",
    });
    expect(getPlayer(s, "p1").propertySets[0]!.color).toBe("pink");
  });

  it("rejects wild2 placement to a color it doesn't carry", () => {
    let s = newGame();
    const wild = findCard(
      (c) =>
        c.kind === "wild2" &&
        c.sets[0] === "orange" &&
        c.sets[1] === "pink",
    );
    s = injectHand(s, "p1", [wild]);
    s = applyAction(s, { type: "DRAW_TURN_START", playerId: "p1" });
    expect(() =>
      applyAction(s, {
        type: "PLAY_PROPERTY",
        playerId: "p1",
        cardId: wild,
        assignedColor: "red",
      }),
    ).toThrow();
  });

  it("rejects rainbow wild standing alone", () => {
    let s = newGame();
    const rainbow = findCard((c) => c.kind === "wild10");
    s = injectHand(s, "p1", [rainbow]);
    s = applyAction(s, { type: "DRAW_TURN_START", playerId: "p1" });
    expect(() =>
      applyAction(s, {
        type: "PLAY_PROPERTY",
        playerId: "p1",
        cardId: rainbow,
        assignedColor: "red",
      }),
    ).toThrow();
  });

  it("places a rainbow wild attached to an existing group", () => {
    let s = newGame();
    const reds = allCardsOfKind((c) => c.kind === "property" && c.set === "red");
    const rainbow = findCard((c) => c.kind === "wild10");
    s = injectHand(s, "p1", [reds[0]!, rainbow]);
    s = applyAction(s, { type: "DRAW_TURN_START", playerId: "p1" });
    s = applyAction(s, {
      type: "PLAY_PROPERTY",
      playerId: "p1",
      cardId: reds[0]!,
      assignedColor: "red",
    });
    s = applyAction(s, {
      type: "PLAY_PROPERTY",
      playerId: "p1",
      cardId: rainbow,
      assignedColor: "red",
    });
    expect(getPlayer(s, "p1").propertySets[0]!.cardIds.length).toBe(2);
  });

  it("extends an already-complete same-color group instead of spawning a new one (overcomplete is one set)", () => {
    // Brown completes at 2. Playing a third brown must keep one brown group
    // (3 cards = overcomplete) — wildcards in a complete set may leave later
    // via REASSIGN_WILD, and Deal Breaker treats the whole group as one set.
    let s = newGame();
    const browns = allCardsOfKind((c) => c.kind === "property" && c.set === "brown");
    expect(browns.length).toBe(2);
    const brownWild = findCard(
      (c) =>
        c.kind === "wild2" &&
        c.sets.includes("brown") &&
        c.sets.includes("lightBlue"),
    );
    s = injectHand(s, "p1", [browns[0]!, browns[1]!, brownWild]);
    s = applyAction(s, { type: "DRAW_TURN_START", playerId: "p1" });
    s = applyAction(s, { type: "PLAY_PROPERTY", playerId: "p1", cardId: browns[0]!, assignedColor: "brown" });
    s = applyAction(s, { type: "PLAY_PROPERTY", playerId: "p1", cardId: browns[1]!, assignedColor: "brown" });
    s = applyAction(s, { type: "PLAY_PROPERTY", playerId: "p1", cardId: brownWild, assignedColor: "brown" });
    const p1 = getPlayer(s, "p1");
    const brownGroups = p1.propertySets.filter((g) => g.color === "brown");
    expect(brownGroups.length).toBe(1);
    expect(brownGroups[0]!.cardIds.length).toBe(3);
    expect(brownGroups[0]!.cardIds).toContain(brownWild);
    expect(isComplete(brownGroups[0]!)).toBe(true);
  });

  it("keeps growing a complete set when wildcards already finished it (4/3, 5/3 still one orange set)", () => {
    // User-reported scenario: 3/3 orange already complete (with a wildcard),
    // then more orange cards must keep flowing into the same set — never
    // spawning a stranded 1/3 partial group of the same color.
    let s = newGame();
    const oranges = allCardsOfKind((c) => c.kind === "property" && c.set === "orange");
    const orangeWilds = allCardsOfKind(
      (c) => c.kind === "wild2" && c.sets.includes("orange") && c.sets.includes("pink"),
    );
    expect(oranges.length).toBe(3);
    expect(orangeWilds.length).toBe(2);

    // Turn 1: complete orange with 2 solids + 1 wild2.
    s = injectHand(s, "p1", [oranges[0]!, oranges[1]!, orangeWilds[0]!]);
    s = applyAction(s, { type: "DRAW_TURN_START", playerId: "p1" });
    s = applyAction(s, { type: "PLAY_PROPERTY", playerId: "p1", cardId: oranges[0]!, assignedColor: "orange" });
    s = applyAction(s, { type: "PLAY_PROPERTY", playerId: "p1", cardId: oranges[1]!, assignedColor: "orange" });
    s = applyAction(s, { type: "PLAY_PROPERTY", playerId: "p1", cardId: orangeWilds[0]!, assignedColor: "orange" });

    // Skip to p1's next turn.
    s = applyAction(s, { type: "END_TURN", playerId: "p1" });
    s = applyAction(s, { type: "DRAW_TURN_START", playerId: "p2" });
    s = applyAction(s, { type: "END_TURN", playerId: "p2" });
    s = applyAction(s, { type: "DRAW_TURN_START", playerId: "p3" });
    s = applyAction(s, { type: "END_TURN", playerId: "p3" });

    // Turn 2: pile two more oranges onto the already-complete group.
    s = injectHand(s, "p1", [oranges[2]!, orangeWilds[1]!]);
    s = applyAction(s, { type: "DRAW_TURN_START", playerId: "p1" });
    s = applyAction(s, { type: "PLAY_PROPERTY", playerId: "p1", cardId: oranges[2]!, assignedColor: "orange" });

    let p1 = getPlayer(s, "p1");
    let orangeGroups = p1.propertySets.filter((g) => g.color === "orange");
    expect(orangeGroups.length).toBe(1);
    expect(orangeGroups[0]!.cardIds.length).toBe(4);

    s = applyAction(s, { type: "PLAY_PROPERTY", playerId: "p1", cardId: orangeWilds[1]!, assignedColor: "orange" });
    p1 = getPlayer(s, "p1");
    orangeGroups = p1.propertySets.filter((g) => g.color === "orange");
    expect(orangeGroups.length).toBe(1);
    expect(orangeGroups[0]!.cardIds.length).toBe(5);
    // All five orange-capable cards landed in the single set.
    for (const cid of [...oranges, ...orangeWilds]) {
      expect(orangeGroups[0]!.cardIds).toContain(cid);
    }
    // Set still complete; rent should still be the top of the orange ladder.
    expect(isComplete(orangeGroups[0]!)).toBe(true);
    expect(rentFor(p1, "orange")).toBe(SET_DEFS.orange.rentLadder.at(-1));
  });

  it("prefers an existing partial group over an existing complete group when both exist (defensive: stale state)", () => {
    // If a player ever ends up with [3/3 complete, 1/3 partial] of the same
    // color (e.g., from a Deal Breaker stacked on top of an existing partial
    // set, or from older saved state), a fresh same-color play should land in
    // the partial — extending it toward completion — not pile onto the
    // already-complete group.
    let s = newGame();
    const oranges = allCardsOfKind((c) => c.kind === "property" && c.set === "orange");
    const orangeWilds = allCardsOfKind(
      (c) => c.kind === "wild2" && c.sets.includes("orange") && c.sets.includes("pink"),
    );
    s = injectHand(s, "p1", [orangeWilds[0]!]);
    // Hand-roll the buggy two-orange-group state directly on p1's properties,
    // then verify the next placement collapses it correctly.
    s = {
      ...s,
      players: s.players.map((p) =>
        p.id === "p1"
          ? {
              ...p,
              propertySets: [
                { color: "orange" as const, cardIds: [oranges[0]!, oranges[1]!, oranges[2]!], hasHouse: false, hasHotel: false },
                { color: "orange" as const, cardIds: [orangeWilds[1]!], hasHouse: false, hasHotel: false },
              ],
            }
          : p,
      ),
    };
    s = applyAction(s, { type: "DRAW_TURN_START", playerId: "p1" });
    s = applyAction(s, { type: "PLAY_PROPERTY", playerId: "p1", cardId: orangeWilds[0]!, assignedColor: "orange" });
    const p1 = getPlayer(s, "p1");
    const orangeGroups = p1.propertySets.filter((g) => g.color === "orange");
    expect(orangeGroups.length).toBe(2);
    const complete = orangeGroups.find((g) => g.cardIds.length === 3)!;
    const partial = orangeGroups.find((g) => g.cardIds.length !== 3)!;
    expect(complete.cardIds.length).toBe(3);
    expect(partial.cardIds.length).toBe(2);
    expect(partial.cardIds).toContain(orangeWilds[0]!);
    expect(partial.cardIds).toContain(orangeWilds[1]!);
  });
});

// ---------------------------------------------------------------------------
// PLAY_AS_MONEY
// ---------------------------------------------------------------------------

describe("PLAY_AS_MONEY", () => {
  it("banks a money card", () => {
    let s = newGame();
    const m5 = findCard((c) => c.kind === "money" && c.value === 5);
    s = injectHand(s, "p1", [m5]);
    s = applyAction(s, { type: "DRAW_TURN_START", playerId: "p1" });
    s = applyAction(s, { type: "PLAY_AS_MONEY", playerId: "p1", cardId: m5 });
    expect(getPlayer(s, "p1").bank).toEqual([m5]);
  });

  it("banks an action card sideways", () => {
    let s = newGame();
    const dealBreaker = findCard((c) => c.kind === "action" && c.action === "dealBreaker");
    s = injectHand(s, "p1", [dealBreaker]);
    s = applyAction(s, { type: "DRAW_TURN_START", playerId: "p1" });
    s = applyAction(s, { type: "PLAY_AS_MONEY", playerId: "p1", cardId: dealBreaker });
    expect(getPlayer(s, "p1").bank).toEqual([dealBreaker]);
  });

  it("rejects banking a wild card", () => {
    let s = newGame();
    const wild = findCard((c) => c.kind === "wild2");
    s = injectHand(s, "p1", [wild]);
    s = applyAction(s, { type: "DRAW_TURN_START", playerId: "p1" });
    expect(() =>
      applyAction(s, { type: "PLAY_AS_MONEY", playerId: "p1", cardId: wild }),
    ).toThrow();
  });

  it("rejects banking a solid property", () => {
    let s = newGame();
    const red = findCard((c) => c.kind === "property" && c.set === "red");
    s = injectHand(s, "p1", [red]);
    s = applyAction(s, { type: "DRAW_TURN_START", playerId: "p1" });
    expect(() =>
      applyAction(s, { type: "PLAY_AS_MONEY", playerId: "p1", cardId: red }),
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// PASS_GO
// ---------------------------------------------------------------------------

describe("PLAY_PASS_GO", () => {
  it("draws +2 cards and consumes 1 play", () => {
    let s = newGame();
    const passGo = findCard((c) => c.kind === "action" && c.action === "passGo");
    s = injectHand(s, "p1", [passGo]);
    s = applyAction(s, { type: "DRAW_TURN_START", playerId: "p1" });
    const beforeHand = getPlayer(s, "p1").hand.length;
    s = applyAction(s, { type: "PLAY_PASS_GO", playerId: "p1", cardId: passGo });
    expect(getPlayer(s, "p1").hand.length).toBe(beforeHand - 1 + 2);
    expect(s.playsRemaining).toBe(2);
  });

  it("emits a passGo log event with count=2 for the AnimationLayer", () => {
    let s = newGame();
    const passGo = findCard((c) => c.kind === "action" && c.action === "passGo");
    s = injectHand(s, "p1", [passGo]);
    s = applyAction(s, { type: "DRAW_TURN_START", playerId: "p1" });
    const logBefore = s.log.length;
    s = applyAction(s, { type: "PLAY_PASS_GO", playerId: "p1", cardId: passGo });
    const events = s.log.slice(logBefore).map((e) => e.event);
    const passGoEvent = events.find((e) => e?.kind === "passGo");
    // The client AnimationLayer reads `count` to size the "+N" overlay over
    // the deck; if this contract drifts, the Pass Go feel silently regresses.
    expect(passGoEvent).toBeDefined();
    expect(passGoEvent?.actorId).toBe("p1");
    expect(passGoEvent?.count).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// HOUSE / HOTEL
// ---------------------------------------------------------------------------

describe("PLAY_HOUSE / PLAY_HOTEL", () => {
  function buildCompleteRedSet(): { state: GameState; house: CardId; hotel: CardId } {
    let s = newGame();
    const reds = allCardsOfKind((c) => c.kind === "property" && c.set === "red").slice(0, 3);
    const house = findCard((c) => c.kind === "action" && c.action === "house");
    const hotel = findCard((c) => c.kind === "action" && c.action === "hotel");
    s = injectHand(s, "p1", [...reds, house, hotel]);
    s = applyAction(s, { type: "DRAW_TURN_START", playerId: "p1" });
    for (const r of reds) {
      s = applyAction(s, {
        type: "PLAY_PROPERTY",
        playerId: "p1",
        cardId: r,
        assignedColor: "red",
      });
    }
    return { state: s, house, hotel };
  }

  it("attaches a house to a complete standard-color set", () => {
    const built = buildCompleteRedSet();
    // 3 plays consumed by properties; need to end & restart to get plays back.
    let s = applyAction(built.state, { type: "END_TURN", playerId: "p1" });
    // p2's whole turn:
    s = applyAction(s, { type: "DRAW_TURN_START", playerId: "p2" });
    s = applyAction(s, { type: "END_TURN", playerId: "p2" });
    // Skip p3's turn similarly:
    s = applyAction(s, { type: "DRAW_TURN_START", playerId: "p3" });
    s = applyAction(s, { type: "END_TURN", playerId: "p3" });
    // p1's next turn:
    s = applyAction(s, { type: "DRAW_TURN_START", playerId: "p1" });
    s = applyAction(s, {
      type: "PLAY_HOUSE",
      playerId: "p1",
      cardId: built.house,
      targetColor: "red",
    });
    const redGroup = getPlayer(s, "p1").propertySets.find((g) => g.color === "red")!;
    expect(redGroup.hasHouse).toBe(true);
    expect(rentFor(getPlayer(s, "p1"), "red")).toBe(6 + 3);
  });

  it("rejects a house on an incomplete set", () => {
    let s = newGame();
    const red = findCard((c) => c.kind === "property" && c.set === "red");
    const house = findCard((c) => c.kind === "action" && c.action === "house");
    s = injectHand(s, "p1", [red, house]);
    s = applyAction(s, { type: "DRAW_TURN_START", playerId: "p1" });
    s = applyAction(s, {
      type: "PLAY_PROPERTY",
      playerId: "p1",
      cardId: red,
      assignedColor: "red",
    });
    expect(() =>
      applyAction(s, { type: "PLAY_HOUSE", playerId: "p1", cardId: house, targetColor: "red" }),
    ).toThrow();
  });

  it("rejects a house on a railroad set", () => {
    let s = newGame();
    const rrs = allCardsOfKind((c) => c.kind === "property" && c.set === "railroad").slice(0, 4);
    const house = findCard((c) => c.kind === "action" && c.action === "house");
    s = injectHand(s, "p1", rrs);
    s = applyAction(s, { type: "DRAW_TURN_START", playerId: "p1" });
    // Play 3 railroads (1 play left); need to play 4th later or skip.
    for (let i = 0; i < 3; i++) {
      s = applyAction(s, {
        type: "PLAY_PROPERTY",
        playerId: "p1",
        cardId: rrs[i]!,
        assignedColor: "railroad",
      });
    }
    s = applyAction(s, { type: "END_TURN", playerId: "p1" });
    s = applyAction(s, { type: "DRAW_TURN_START", playerId: "p2" });
    s = applyAction(s, { type: "END_TURN", playerId: "p2" });
    s = applyAction(s, { type: "DRAW_TURN_START", playerId: "p3" });
    s = applyAction(s, { type: "END_TURN", playerId: "p3" });
    s = applyAction(s, { type: "DRAW_TURN_START", playerId: "p1" });
    s = applyAction(s, {
      type: "PLAY_PROPERTY",
      playerId: "p1",
      cardId: rrs[3]!,
      assignedColor: "railroad",
    });
    s = injectHand(s, "p1", [house, ...getPlayer(s, "p1").hand]);
    expect(() =>
      applyAction(s, { type: "PLAY_HOUSE", playerId: "p1", cardId: house, targetColor: "railroad" }),
    ).toThrow();
  });

  it("requires a house before a hotel", () => {
    const built = buildCompleteRedSet();
    let s = applyAction(built.state, { type: "END_TURN", playerId: "p1" });
    s = applyAction(s, { type: "DRAW_TURN_START", playerId: "p2" });
    s = applyAction(s, { type: "END_TURN", playerId: "p2" });
    s = applyAction(s, { type: "DRAW_TURN_START", playerId: "p3" });
    s = applyAction(s, { type: "END_TURN", playerId: "p3" });
    s = applyAction(s, { type: "DRAW_TURN_START", playerId: "p1" });
    expect(() =>
      applyAction(s, { type: "PLAY_HOTEL", playerId: "p1", cardId: built.hotel, targetColor: "red" }),
    ).toThrow();
  });

  // freeActionCard correctness: house/hotel cards are "floating" (not tracked
  // in any collection) while attached. When a set breaks, freeActionCard
  // finds the floating card by exclusion from inPlay and returns it to bank.

  it("house detaches to bank when payment transfers a property out of the complete set", () => {
    const built = buildCompleteRedSet();
    let s = applyAction(built.state, { type: "END_TURN", playerId: "p1" });
    for (const pid of ["p2", "p3"] as const) {
      s = applyAction(s, { type: "DRAW_TURN_START", playerId: pid });
      s = applyAction(s, { type: "END_TURN", playerId: pid });
    }
    s = applyAction(s, { type: "DRAW_TURN_START", playerId: "p1" });
    s = applyAction(s, { type: "PLAY_HOUSE", playerId: "p1", cardId: built.house, targetColor: "red" });
    s = applyAction(s, { type: "END_TURN", playerId: "p1" });

    // p2 plays Debt Collector ($5M). p1 pays with 2 reds ($6M ≥ $5M),
    // leaving the set at 1/3 (broken) → house floats back to p1's bank.
    const dcCard = findCard((c) => c.kind === "action" && c.action === "debtCollector");
    const reds = allCardsOfKind((c) => c.kind === "property" && c.set === "red").slice(0, 2);
    s = injectHand(s, "p2", [dcCard]);
    s = applyAction(s, { type: "DRAW_TURN_START", playerId: "p2" });
    s = applyAction(s, {
      type: "PLAY_DEBT_COLLECTOR",
      playerId: "p2",
      cardId: dcCard,
      targetPlayerId: "p1",
    });
    s = applyAction(s, { type: "RESPOND_JSN", playerId: "p1", play: false });
    s = applyAction(s, { type: "PAY", playerId: "p1", cardIds: [reds[0]!, reds[1]!] });

    const p1After = getPlayer(s, "p1");
    const redGroup = p1After.propertySets.find((g) => g.color === "red");
    expect(redGroup?.hasHouse).toBe(false);
    expect(p1After.bank).toContain(built.house);
  });

  it("hotel and house both detach to bank (hotel first) when payment breaks the set", () => {
    const built = buildCompleteRedSet();
    let s = applyAction(built.state, { type: "END_TURN", playerId: "p1" });
    for (const pid of ["p2", "p3"] as const) {
      s = applyAction(s, { type: "DRAW_TURN_START", playerId: pid });
      s = applyAction(s, { type: "END_TURN", playerId: pid });
    }
    // p1 plays house then hotel in the same turn (2 plays each, 3 available)
    s = applyAction(s, { type: "DRAW_TURN_START", playerId: "p1" });
    s = applyAction(s, { type: "PLAY_HOUSE", playerId: "p1", cardId: built.house, targetColor: "red" });
    s = applyAction(s, { type: "PLAY_HOTEL", playerId: "p1", cardId: built.hotel, targetColor: "red" });
    const redGroupBefore = getPlayer(s, "p1").propertySets.find((g) => g.color === "red")!;
    expect(redGroupBefore.hasHouse).toBe(true);
    expect(redGroupBefore.hasHotel).toBe(true);
    s = applyAction(s, { type: "END_TURN", playerId: "p1" });

    // p2 DC on p1 — p1 pays 2 reds, breaking 3/3 → 1/3.
    const dcCard = findCard((c) => c.kind === "action" && c.action === "debtCollector");
    const reds = allCardsOfKind((c) => c.kind === "property" && c.set === "red").slice(0, 2);
    s = injectHand(s, "p2", [dcCard]);
    s = applyAction(s, { type: "DRAW_TURN_START", playerId: "p2" });
    s = applyAction(s, {
      type: "PLAY_DEBT_COLLECTOR",
      playerId: "p2",
      cardId: dcCard,
      targetPlayerId: "p1",
    });
    s = applyAction(s, { type: "RESPOND_JSN", playerId: "p1", play: false });
    s = applyAction(s, { type: "PAY", playerId: "p1", cardIds: [reds[0]!, reds[1]!] });

    const p1After = getPlayer(s, "p1");
    const redGroup = p1After.propertySets.find((g) => g.color === "red");
    expect(redGroup?.hasHotel).toBe(false);
    expect(redGroup?.hasHouse).toBe(false);
    // Both the played hotel and house card IDs land in p1's bank.
    expect(p1After.bank).toContain(built.hotel);
    expect(p1After.bank).toContain(built.house);
  });
});

// ---------------------------------------------------------------------------
// END_TURN + discard-to-limit
// ---------------------------------------------------------------------------

describe("END_TURN", () => {
  it("advances to next player", () => {
    let s = newGame();
    s = applyAction(s, { type: "DRAW_TURN_START", playerId: "p1" });
    s = applyAction(s, { type: "END_TURN", playerId: "p1" });
    expect(s.currentTurn).toBe(1);
    expect(s.playsRemaining).toBe(3);
    expect(s.hasDrawnThisTurn).toBe(false);
    expect(s.pending).toBeNull();
  });

  it("triggers discard-to-limit when over 7 in hand at end of turn", () => {
    // Inject an 8-card hand pre-draw, then DRAW (adds 2 -> 10), end turn.
    let s = newGame();
    const eight = DECK.slice(0, 10).map((c) => c.id);
    s = injectHand(s, "p1", eight);
    s = applyAction(s, { type: "DRAW_TURN_START", playerId: "p1" });
    expect(getPlayer(s, "p1").hand.length).toBe(12);
    s = applyAction(s, { type: "END_TURN", playerId: "p1" });
    expect(s.pending).not.toBeNull();
    expect(s.pending!.kind).toBe("awaitDiscardToLimit");
  });

  it("DISCARD_TO_LIMIT must drop exactly the right number, then advances turn", () => {
    let s = newGame();
    const ten = DECK.slice(0, 10).map((c) => c.id);
    s = injectHand(s, "p1", ten);
    s = applyAction(s, { type: "DRAW_TURN_START", playerId: "p1" });
    s = applyAction(s, { type: "END_TURN", playerId: "p1" });
    // hand was 12, must discard 5
    expect(s.pending!.kind).toBe("awaitDiscardToLimit");
    const toDiscard = getPlayer(s, "p1").hand.slice(0, 5);
    s = applyAction(s, { type: "DISCARD_TO_LIMIT", playerId: "p1", cardIds: toDiscard });
    expect(s.pending).toBeNull();
    expect(s.currentTurn).toBe(1);
    expect(getPlayer(s, "p1").hand.length).toBe(7);
    expect(s.discardPile.length).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// REASSIGN_WILD
// ---------------------------------------------------------------------------

describe("REASSIGN_WILD", () => {
  it("moves a wild2 from one valid color to the other (free, no play consumed)", () => {
    let s = newGame();
    const wild = findCard(
      (c) => c.kind === "wild2" && c.sets[0] === "orange" && c.sets[1] === "pink",
    );
    s = injectHand(s, "p1", [wild]);
    s = applyAction(s, { type: "DRAW_TURN_START", playerId: "p1" });
    s = applyAction(s, {
      type: "PLAY_PROPERTY",
      playerId: "p1",
      cardId: wild,
      assignedColor: "orange",
    });
    expect(s.playsRemaining).toBe(2);
    s = applyAction(s, {
      type: "REASSIGN_WILD",
      playerId: "p1",
      cardId: wild,
      fromColor: "orange",
      toColor: "pink",
    });
    const p1 = getPlayer(s, "p1");
    expect(p1.propertySets.find((g) => g.color === "orange")).toBeUndefined();
    expect(p1.propertySets.find((g) => g.color === "pink")?.cardIds).toEqual([wild]);
    // Reassignment is free — no decrement.
    expect(s.playsRemaining).toBe(2);
  });

  it("can reassign even with 0 plays remaining (any time during your turn)", () => {
    let s = newGame();
    const wild = findCard(
      (c) => c.kind === "wild2" && c.sets[0] === "orange" && c.sets[1] === "pink",
    );
    const oranges = allCardsOfKind((c) => c.kind === "property" && c.set === "orange");
    s = injectHand(s, "p1", [wild, oranges[0]!, oranges[1]!]);
    s = applyAction(s, { type: "DRAW_TURN_START", playerId: "p1" });
    // Burn all 3 plays placing properties.
    s = applyAction(s, {
      type: "PLAY_PROPERTY",
      playerId: "p1",
      cardId: oranges[0]!,
      assignedColor: "orange",
    });
    s = applyAction(s, {
      type: "PLAY_PROPERTY",
      playerId: "p1",
      cardId: oranges[1]!,
      assignedColor: "orange",
    });
    s = applyAction(s, {
      type: "PLAY_PROPERTY",
      playerId: "p1",
      cardId: wild,
      assignedColor: "orange",
    });
    expect(s.playsRemaining).toBe(0);
    // Should still be allowed to reassign with 0 plays left.
    s = applyAction(s, {
      type: "REASSIGN_WILD",
      playerId: "p1",
      cardId: wild,
      fromColor: "orange",
      toColor: "pink",
    });
    const p1 = getPlayer(s, "p1");
    expect(p1.propertySets.find((g) => g.color === "pink")?.cardIds).toEqual([wild]);
    expect(s.playsRemaining).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Win check
// ---------------------------------------------------------------------------

describe("win check", () => {
  it("declares winner on 3 complete sets of distinct colors", () => {
    // Brown (2) + Light Blue (3) + Red (3) = 3 distinct complete sets.
    // Inject only what each turn needs to avoid hand-limit overflow on END_TURN.
    let s = newGame(2, 7);
    const browns = allCardsOfKind((c) => c.kind === "property" && c.set === "brown");
    const lights = allCardsOfKind((c) => c.kind === "property" && c.set === "lightBlue");
    const reds = allCardsOfKind((c) => c.kind === "property" && c.set === "red");

    // Turn 1 — p1: play 2 browns + 1 light blue.
    s = injectHand(s, "p1", [browns[0]!, browns[1]!, lights[0]!]);
    s = applyAction(s, { type: "DRAW_TURN_START", playerId: "p1" });
    s = applyAction(s, { type: "PLAY_PROPERTY", playerId: "p1", cardId: browns[0]!, assignedColor: "brown" });
    s = applyAction(s, { type: "PLAY_PROPERTY", playerId: "p1", cardId: browns[1]!, assignedColor: "brown" });
    s = applyAction(s, { type: "PLAY_PROPERTY", playerId: "p1", cardId: lights[0]!, assignedColor: "lightBlue" });
    s = injectHand(s, "p1", []); // drop random draws so end-turn doesn't overflow
    s = applyAction(s, { type: "END_TURN", playerId: "p1" });

    s = applyAction(s, { type: "DRAW_TURN_START", playerId: "p2" });
    s = injectHand(s, "p2", []);
    s = applyAction(s, { type: "END_TURN", playerId: "p2" });

    // Turn 2 — p1: complete light blue + start red.
    s = injectHand(s, "p1", [lights[1]!, lights[2]!, reds[0]!]);
    s = applyAction(s, { type: "DRAW_TURN_START", playerId: "p1" });
    s = applyAction(s, { type: "PLAY_PROPERTY", playerId: "p1", cardId: lights[1]!, assignedColor: "lightBlue" });
    s = applyAction(s, { type: "PLAY_PROPERTY", playerId: "p1", cardId: lights[2]!, assignedColor: "lightBlue" });
    s = applyAction(s, { type: "PLAY_PROPERTY", playerId: "p1", cardId: reds[0]!, assignedColor: "red" });
    s = injectHand(s, "p1", []);
    s = applyAction(s, { type: "END_TURN", playerId: "p1" });

    s = applyAction(s, { type: "DRAW_TURN_START", playerId: "p2" });
    s = injectHand(s, "p2", []);
    s = applyAction(s, { type: "END_TURN", playerId: "p2" });

    // Turn 3 — p1: complete red, win.
    s = injectHand(s, "p1", [reds[1]!, reds[2]!]);
    s = applyAction(s, { type: "DRAW_TURN_START", playerId: "p1" });
    s = applyAction(s, { type: "PLAY_PROPERTY", playerId: "p1", cardId: reds[1]!, assignedColor: "red" });
    s = applyAction(s, { type: "PLAY_PROPERTY", playerId: "p1", cardId: reds[2]!, assignedColor: "red" });
    expect(s.phase).toBe("ended");
    expect(s.winnerId).toBe("p1");
  });

  it("does NOT declare winner when 3 complete sets are only 2 distinct colors", () => {
    // Two complete railroad sets of 4 each + one complete brown set = only 2
    // distinct colors (railroad, brown). Not a win.
    let s = newGame(2);
    const rrs = allCardsOfKind((c) => c.kind === "property" && c.set === "railroad");
    const browns = allCardsOfKind((c) => c.kind === "property" && c.set === "brown");
    // Need 8 railroads to get 2 complete sets — only 4 exist; this case is
    // theoretical. We instead test 1 complete brown + 1 complete utility (2 each).
    const utils = allCardsOfKind((c) => c.kind === "property" && c.set === "utility");
    s = injectHand(s, "p1", [...browns, ...utils]);
    s = applyAction(s, { type: "DRAW_TURN_START", playerId: "p1" });
    s = applyAction(s, { type: "PLAY_PROPERTY", playerId: "p1", cardId: browns[0]!, assignedColor: "brown" });
    s = applyAction(s, { type: "PLAY_PROPERTY", playerId: "p1", cardId: browns[1]!, assignedColor: "brown" });
    s = applyAction(s, { type: "PLAY_PROPERTY", playerId: "p1", cardId: utils[0]!, assignedColor: "utility" });
    expect(s.phase).toBe("playing");
  });
});

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

describe("rentFor / isComplete", () => {
  it("computes rent ladder values", () => {
    let s = newGame();
    const reds = allCardsOfKind((c) => c.kind === "property" && c.set === "red");
    s = injectHand(s, "p1", reds);
    s = applyAction(s, { type: "DRAW_TURN_START", playerId: "p1" });
    s = applyAction(s, { type: "PLAY_PROPERTY", playerId: "p1", cardId: reds[0]!, assignedColor: "red" });
    expect(rentFor(getPlayer(s, "p1"), "red")).toBe(2);
    s = applyAction(s, { type: "PLAY_PROPERTY", playerId: "p1", cardId: reds[1]!, assignedColor: "red" });
    expect(rentFor(getPlayer(s, "p1"), "red")).toBe(3);
    s = applyAction(s, { type: "PLAY_PROPERTY", playerId: "p1", cardId: reds[2]!, assignedColor: "red" });
    expect(rentFor(getPlayer(s, "p1"), "red")).toBe(6);
    expect(isComplete(getPlayer(s, "p1").propertySets[0]!)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Structured log events (animation cues)
// ---------------------------------------------------------------------------

describe("log events: setComplete / setBroken", () => {
  it("emits setComplete when a property play completes a set", () => {
    let s = newGame(2);
    const browns = allCardsOfKind((c) => c.kind === "property" && c.set === "brown");
    s = injectHand(s, "p1", [browns[0]!, browns[1]!]);
    s = applyAction(s, { type: "DRAW_TURN_START", playerId: "p1" });
    // First brown: incomplete → no setComplete event yet.
    s = applyAction(s, {
      type: "PLAY_PROPERTY",
      playerId: "p1",
      cardId: browns[0]!,
      assignedColor: "brown",
    });
    expect(s.log.find((e) => e.event?.kind === "setComplete")).toBeUndefined();
    // Second brown: completes the 2-card set → emits setComplete.
    s = applyAction(s, {
      type: "PLAY_PROPERTY",
      playerId: "p1",
      cardId: browns[1]!,
      assignedColor: "brown",
    });
    const completeEvents = s.log.filter((e) => e.event?.kind === "setComplete");
    expect(completeEvents.length).toBe(1);
    expect(completeEvents[0]!.event).toMatchObject({
      kind: "setComplete",
      actorId: "p1",
      color: "brown",
    });
  });

  it("emits setComplete when a wild reassignment completes a new set", () => {
    let s = newGame(2);
    // Inject 2 browns + a brown/lightBlue wild2. Play all into brown (overcompletes
    // brown — 3 cards in a 2-card set, which is allowed). Then reassign the wild
    // to lightBlue. Brown should setBroken, but no setComplete fires for lightBlue
    // (1 card alone isn't enough). Then add 2 more lightBlues to verify completion.
    const browns = allCardsOfKind((c) => c.kind === "property" && c.set === "brown");
    const wildBL = findCard(
      (c) =>
        c.kind === "wild2" &&
        ((c.sets[0] === "lightBlue" && c.sets[1] === "brown") ||
          (c.sets[0] === "brown" && c.sets[1] === "lightBlue")),
    );
    s = injectHand(s, "p1", [browns[0]!, browns[1]!, wildBL]);
    s = applyAction(s, { type: "DRAW_TURN_START", playerId: "p1" });
    s = applyAction(s, {
      type: "PLAY_PROPERTY",
      playerId: "p1",
      cardId: browns[0]!,
      assignedColor: "brown",
    });
    s = applyAction(s, {
      type: "PLAY_PROPERTY",
      playerId: "p1",
      cardId: browns[1]!,
      assignedColor: "brown",
    });
    // Brown is now complete (2/2). Adding a wild as brown overcompletes it (3/2).
    s = applyAction(s, {
      type: "PLAY_PROPERTY",
      playerId: "p1",
      cardId: wildBL,
      assignedColor: "brown",
    });
    const beforeReassign = s.log.length;
    // Reassign wild away. Brown drops back to 2/2 — still complete, so no setBroken.
    s = applyAction(s, {
      type: "REASSIGN_WILD",
      playerId: "p1",
      cardId: wildBL,
      fromColor: "brown",
      toColor: "lightBlue",
    });
    const newEvents = s.log.slice(beforeReassign).map((e) => e.event?.kind);
    expect(newEvents).not.toContain("setBroken");
    expect(newEvents).not.toContain("setComplete");
  });

  it("emits setBroken when wild reassignment drops a complete set below threshold", () => {
    // Build a complete brown set as 1 solid + 1 wild2 (2/2). Then reassign the
    // wild away → brown drops to 1/2 → setBroken fires.
    let s = newGame(2, 9);
    const brown0 = findCard((c) => c.kind === "property" && c.set === "brown");
    const wildBL = findCard(
      (c) =>
        c.kind === "wild2" &&
        ((c.sets[0] === "lightBlue" && c.sets[1] === "brown") ||
          (c.sets[0] === "brown" && c.sets[1] === "lightBlue")),
    );
    s = injectHand(s, "p1", [brown0, wildBL]);
    s = applyAction(s, { type: "DRAW_TURN_START", playerId: "p1" });
    s = applyAction(s, {
      type: "PLAY_PROPERTY",
      playerId: "p1",
      cardId: brown0,
      assignedColor: "brown",
    });
    s = applyAction(s, {
      type: "PLAY_PROPERTY",
      playerId: "p1",
      cardId: wildBL,
      assignedColor: "brown",
    });
    // Brown is complete (2/2). Reassign wild → brown 1/2.
    expect(
      s.log.find((e) => e.event?.kind === "setComplete" && e.event.color === "brown"),
    ).toBeDefined();
    s = applyAction(s, {
      type: "REASSIGN_WILD",
      playerId: "p1",
      cardId: wildBL,
      fromColor: "brown",
      toColor: "lightBlue",
    });
    const broken = s.log.filter((e) => e.event?.kind === "setBroken");
    expect(broken.length).toBe(1);
    expect(broken[0]!.event).toMatchObject({
      kind: "setBroken",
      actorId: "p1",
      color: "brown",
    });
  });

  it("emits setBroken on the victim and setComplete on the thief when Deal Breaker steals", () => {
    let s = newGame(2, 11);
    const browns = allCardsOfKind((c) => c.kind === "property" && c.set === "brown");
    const dealBreaker = findCard((c) => c.kind === "action" && c.action === "dealBreaker");
    // p1 completes a brown set.
    s = injectHand(s, "p1", [browns[0]!, browns[1]!]);
    s = applyAction(s, { type: "DRAW_TURN_START", playerId: "p1" });
    s = applyAction(s, {
      type: "PLAY_PROPERTY",
      playerId: "p1",
      cardId: browns[0]!,
      assignedColor: "brown",
    });
    s = applyAction(s, {
      type: "PLAY_PROPERTY",
      playerId: "p1",
      cardId: browns[1]!,
      assignedColor: "brown",
    });
    s = injectHand(s, "p1", []);
    s = applyAction(s, { type: "END_TURN", playerId: "p1" });

    // p2 plays Deal Breaker on p1's brown set.
    s = applyAction(s, { type: "DRAW_TURN_START", playerId: "p2" });
    s = injectHand(s, "p2", [dealBreaker]);
    const p1Group = getPlayer(s, "p1").propertySets.findIndex((g) => g.color === "brown");
    s = applyAction(s, {
      type: "PLAY_DEAL_BREAKER",
      playerId: "p2",
      cardId: dealBreaker,
      targetPlayerId: "p1",
      targetColor: "brown",
      targetGroupIdx: p1Group,
    });
    s = applyAction(s, { type: "RESPOND_JSN", playerId: "p1", play: false });
    // p1 loses brown completion, p2 gains it.
    const broken = s.log.filter((e) => e.event?.kind === "setBroken");
    const complete = s.log.filter(
      (e) => e.event?.kind === "setComplete" && e.event.actorId === "p2",
    );
    expect(broken.some((e) => e.event!.actorId === "p1" && e.event!.color === "brown")).toBe(true);
    expect(complete.length).toBeGreaterThanOrEqual(1);
  });
});

describe("log events: structured payloads", () => {
  it("attaches event.kind=draw with count on initial draw", () => {
    const s = newGame(2);
    const drawTurnStart = applyAction(s, { type: "DRAW_TURN_START", playerId: "p1" });
    const drawEvents = drawTurnStart.log.filter((e) => e.event?.kind === "draw");
    expect(drawEvents.length).toBe(1);
    expect(drawEvents[0]!.event).toMatchObject({
      kind: "draw",
      actorId: "p1",
      count: 2,
    });
  });

  it("attaches event.kind=turnStart on advanceTurn", () => {
    let s = newGame(2);
    s = injectHand(s, "p1", []);
    s = applyAction(s, { type: "DRAW_TURN_START", playerId: "p1" });
    s = injectHand(s, "p1", []);
    s = applyAction(s, { type: "END_TURN", playerId: "p1" });
    const turnStarts = s.log.filter((e) => e.event?.kind === "turnStart");
    expect(turnStarts.length).toBeGreaterThanOrEqual(1);
    expect(turnStarts[turnStarts.length - 1]!.event!.actorId).toBe("p2");
  });

  it("attaches event.kind=playMoney with amount on bank", () => {
    let s = newGame(2);
    const m5 = findCard((c) => c.kind === "money" && c.value === 5);
    s = injectHand(s, "p1", [m5]);
    s = applyAction(s, { type: "DRAW_TURN_START", playerId: "p1" });
    s = applyAction(s, { type: "PLAY_AS_MONEY", playerId: "p1", cardId: m5 });
    const ev = s.log.find((e) => e.event?.kind === "playMoney");
    expect(ev?.event).toMatchObject({ kind: "playMoney", actorId: "p1", cardId: m5, amount: 5 });
  });

  it("attaches event.kind=win with set count on winning move", () => {
    let s = newGame(2, 13);
    const browns = allCardsOfKind((c) => c.kind === "property" && c.set === "brown");
    const lights = allCardsOfKind((c) => c.kind === "property" && c.set === "lightBlue");
    const reds = allCardsOfKind((c) => c.kind === "property" && c.set === "red");
    // Pre-stack p1 with all 3 sets-worth of cards across turns.
    s = injectHand(s, "p1", [browns[0]!, browns[1]!, lights[0]!]);
    s = applyAction(s, { type: "DRAW_TURN_START", playerId: "p1" });
    s = applyAction(s, { type: "PLAY_PROPERTY", playerId: "p1", cardId: browns[0]!, assignedColor: "brown" });
    s = applyAction(s, { type: "PLAY_PROPERTY", playerId: "p1", cardId: browns[1]!, assignedColor: "brown" });
    s = applyAction(s, { type: "PLAY_PROPERTY", playerId: "p1", cardId: lights[0]!, assignedColor: "lightBlue" });
    s = injectHand(s, "p1", []);
    s = applyAction(s, { type: "END_TURN", playerId: "p1" });
    s = applyAction(s, { type: "DRAW_TURN_START", playerId: "p2" });
    s = injectHand(s, "p2", []);
    s = applyAction(s, { type: "END_TURN", playerId: "p2" });
    s = injectHand(s, "p1", [lights[1]!, lights[2]!, reds[0]!]);
    s = applyAction(s, { type: "DRAW_TURN_START", playerId: "p1" });
    s = applyAction(s, { type: "PLAY_PROPERTY", playerId: "p1", cardId: lights[1]!, assignedColor: "lightBlue" });
    s = applyAction(s, { type: "PLAY_PROPERTY", playerId: "p1", cardId: lights[2]!, assignedColor: "lightBlue" });
    s = applyAction(s, { type: "PLAY_PROPERTY", playerId: "p1", cardId: reds[0]!, assignedColor: "red" });
    s = injectHand(s, "p1", []);
    s = applyAction(s, { type: "END_TURN", playerId: "p1" });
    s = applyAction(s, { type: "DRAW_TURN_START", playerId: "p2" });
    s = injectHand(s, "p2", []);
    s = applyAction(s, { type: "END_TURN", playerId: "p2" });
    s = injectHand(s, "p1", [reds[1]!, reds[2]!]);
    s = applyAction(s, { type: "DRAW_TURN_START", playerId: "p1" });
    s = applyAction(s, { type: "PLAY_PROPERTY", playerId: "p1", cardId: reds[1]!, assignedColor: "red" });
    s = applyAction(s, { type: "PLAY_PROPERTY", playerId: "p1", cardId: reds[2]!, assignedColor: "red" });
    expect(s.phase).toBe("ended");
    const winEvent = s.log.find((e) => e.event?.kind === "win");
    expect(winEvent?.event).toMatchObject({ kind: "win", actorId: "p1" });
    expect(winEvent?.event?.count).toBeGreaterThanOrEqual(3);
  });
});
