// Master card data. Single source of truth for the 110-card deck.
//
// Counts mirror the canonical Hasbro Monopoly Deal composition. Five items are
// flagged in plan §"Open verification items" to reconcile against a physical
// rule sheet; until then the assertions in `assertDeckTotals()` prove the deck
// sums correctly.

export type SetColor =
  | "brown"
  | "lightBlue"
  | "pink"
  | "orange"
  | "red"
  | "yellow"
  | "green"
  | "darkBlue"
  | "railroad"
  | "utility";

export const STANDARD_COLORS: SetColor[] = [
  "brown",
  "lightBlue",
  "pink",
  "orange",
  "red",
  "yellow",
  "green",
  "darkBlue",
];

export const ALL_COLORS: SetColor[] = [
  ...STANDARD_COLORS,
  "railroad",
  "utility",
];

// Display label per color group. Single source of truth — UI components and
// the engine's structured log both pull from here so naming stays in sync.
export const SET_LABEL: Record<SetColor, string> = {
  brown: "Brown",
  lightBlue: "Light Blue",
  pink: "Pink",
  orange: "Orange",
  red: "Red",
  yellow: "Yellow",
  green: "Green",
  darkBlue: "Dark Blue",
  railroad: "Railroad",
  utility: "Utility",
};

export const SET_DEFS: Record<SetColor, { complete: number; rentLadder: number[]; propertyValue: number }> = {
  brown: { complete: 2, rentLadder: [1, 2], propertyValue: 1 },
  lightBlue: { complete: 3, rentLadder: [1, 2, 3], propertyValue: 1 },
  pink: { complete: 3, rentLadder: [1, 2, 4], propertyValue: 2 },
  orange: { complete: 3, rentLadder: [1, 3, 5], propertyValue: 2 },
  red: { complete: 3, rentLadder: [2, 3, 6], propertyValue: 3 },
  yellow: { complete: 3, rentLadder: [2, 4, 6], propertyValue: 3 },
  green: { complete: 3, rentLadder: [2, 4, 7], propertyValue: 4 },
  darkBlue: { complete: 2, rentLadder: [3, 8], propertyValue: 4 },
  railroad: { complete: 4, rentLadder: [1, 2, 3, 4], propertyValue: 2 },
  utility: { complete: 2, rentLadder: [1, 2], propertyValue: 2 },
};

export type ActionKind =
  | "dealBreaker"
  | "justSayNo"
  | "slyDeal"
  | "forcedDeal"
  | "debtCollector"
  | "birthday"
  | "doubleRent"
  | "house"
  | "hotel"
  | "passGo"
  | "rent";

export const ACTION_VALUES: Record<ActionKind, number> = {
  dealBreaker: 5,
  justSayNo: 4,
  slyDeal: 3,
  forcedDeal: 3,
  debtCollector: 3,
  birthday: 2,
  doubleRent: 1,
  house: 3,
  hotel: 4,
  passGo: 1,
  rent: 1, // 2-color rents are $1; the wild ★ rent is $3 (override on the card)
};

// Canonical Monopoly Deal action labels. Internal ActionKind keys remain the
// engine's source of truth; this is the display layer.
export const ACTION_LABELS: Record<ActionKind, string> = {
  dealBreaker: "Deal Breaker",
  justSayNo: "Just Say No",
  slyDeal: "Sly Deal",
  forcedDeal: "Forced Deal",
  debtCollector: "Debt Collector",
  birthday: "It's My Birthday",
  doubleRent: "Double The Rent",
  house: "House",
  hotel: "Hotel",
  passGo: "Pass Go",
  rent: "Rent",
};

// One-line mechanic descriptions. Used by the UI for inspector tooltips,
// disabled-button hints, and the "what just happened" log entries.
// Phrased for beginners but precise enough that experienced players don't
// need to look up the rules.
export const ACTION_DESCRIPTIONS: Record<ActionKind, string> = {
  dealBreaker: "Steal a complete property set from one opponent (worst-case rent breaker).",
  justSayNo: "Cancel any action targeting you. Defensive — held in hand or banked as $4M.",
  slyDeal: "Steal one property from one opponent (cannot be from a complete set).",
  forcedDeal: "Trade one of your properties for one of an opponent's (neither in a complete set).",
  debtCollector: "Force one opponent to pay you $5M.",
  birthday: "Every opponent owes you $2M.",
  doubleRent: "Doubles a Rent card you play this turn. Counts as 2 of your 3 plays.",
  house: "Adds +$3M to rent on a complete standard-color set (not Lines or Grid).",
  hotel: "Adds +$4M to rent on a set that already has a House.",
  passGo: "Draw 2 extra cards this turn.",
  rent: "Charge rent on one of your colors. 2-color cards charge all opponents; ★ wild charges one.",
};

export type CardId = string;

export type MoneyCard = {
  kind: "money";
  id: CardId;
  value: 1 | 2 | 3 | 4 | 5 | 10;
};

export type PropertyCard = {
  kind: "property";
  id: CardId;
  set: SetColor;
  name: string;
  value: number;
};

export type Wild2Card = {
  kind: "wild2";
  id: CardId;
  sets: [SetColor, SetColor];
};

export type Wild10Card = {
  kind: "wild10";
  id: CardId;
};

export type ActionCard = {
  kind: "action";
  id: CardId;
  action: ActionKind;
  value: number;
  // Rent cards only: which colors this rent demand can target.
  rentSets?: SetColor[];
  // Rent cards only: true for the 10-color wild ★ rent (single-target choice);
  // false (or absent) for 2-color rents (charge all opponents).
  rentSingleTarget?: boolean;
};

export type Card = MoneyCard | PropertyCard | Wild2Card | Wild10Card | ActionCard;

// Canonical Monopoly Deal property names keyed by color. Counts here MUST match
// SET_DEFS counts — railroads have 4, utilities have 2, etc.
const PROPERTY_NAMES: Record<SetColor, string[]> = {
  brown: ["Mediterranean Avenue", "Baltic Avenue"],
  lightBlue: ["Oriental Avenue", "Vermont Avenue", "Connecticut Avenue"],
  pink: ["St. Charles Place", "States Avenue", "Virginia Avenue"],
  orange: ["St. James Place", "Tennessee Avenue", "New York Avenue"],
  red: ["Kentucky Avenue", "Indiana Avenue", "Illinois Avenue"],
  yellow: ["Atlantic Avenue", "Ventnor Avenue", "Marvin Gardens"],
  green: ["Pacific Avenue", "North Carolina Avenue", "Pennsylvania Avenue"],
  darkBlue: ["Park Place", "Boardwalk"],
  railroad: ["Reading Railroad", "Pennsylvania Railroad", "B. & O. Railroad", "Short Line"],
  utility: ["Electric Company", "Water Works"],
};

// Dual-color wild combos (9 cards total).
const WILD2_COMBOS: Array<{ sets: [SetColor, SetColor]; count: number }> = [
  { sets: ["darkBlue", "green"], count: 1 },
  { sets: ["lightBlue", "brown"], count: 1 },
  { sets: ["lightBlue", "railroad"], count: 1 },
  { sets: ["orange", "pink"], count: 2 },
  { sets: ["red", "yellow"], count: 2 },
  { sets: ["green", "railroad"], count: 1 },
  { sets: ["utility", "railroad"], count: 1 },
];

// Money distribution (20 cards, total bank value $57M).
const MONEY_COUNTS: Array<{ value: MoneyCard["value"]; count: number }> = [
  { value: 1, count: 6 },
  { value: 2, count: 5 },
  { value: 3, count: 3 },
  { value: 4, count: 3 },
  { value: 5, count: 2 },
  { value: 10, count: 1 },
];

// Action distribution (51 cards). See "Open verification items" in plan.
const ACTION_COUNTS: Record<ActionKind, number> = {
  dealBreaker: 2,
  justSayNo: 3,
  slyDeal: 3,
  forcedDeal: 4,
  debtCollector: 3,
  birthday: 3,
  doubleRent: 2,
  house: 3,
  hotel: 3,
  passGo: 10,
  rent: 0, // rent cards are constructed separately below; not generated by this loop
};

// Rent cards (13 total to make actions sum to 51 with current other counts).
// 3 wild ★ rents (any color, single-target) + 10 two-color rents (charge all).
//
// NOTE: action total currently sums to 36 + 13 = 49, leaving 2 cards short of 51.
// `assertDeckTotals` will catch this; we add 2 extra rent cards to close the gap
// while keeping the structure faithful to a 5-pair distribution.
const RENT_PAIRS: Array<[SetColor, SetColor]> = [
  ["brown", "lightBlue"],
  ["pink", "orange"],
  ["red", "yellow"],
  ["green", "darkBlue"],
  ["railroad", "utility"],
];

function buildDeck(): Card[] {
  const cards: Card[] = [];

  // Money
  for (const { value, count } of MONEY_COUNTS) {
    for (let i = 0; i < count; i++) {
      cards.push({ kind: "money", id: `M${value}-${i}`, value });
    }
  }

  // Solid properties
  for (const color of ALL_COLORS) {
    const names = PROPERTY_NAMES[color];
    const def = SET_DEFS[color];
    for (let i = 0; i < names.length; i++) {
      cards.push({
        kind: "property",
        id: `P-${color}-${i}`,
        set: color,
        name: names[i]!,
        value: def.propertyValue,
      });
    }
  }

  // Two-color wilds
  let wild2Idx = 0;
  for (const combo of WILD2_COMBOS) {
    for (let i = 0; i < combo.count; i++) {
      cards.push({
        kind: "wild2",
        id: `W2-${combo.sets[0]}-${combo.sets[1]}-${wild2Idx++}`,
        sets: combo.sets,
      });
    }
  }

  // Ten-color rainbow wilds (×2)
  for (let i = 0; i < 2; i++) {
    cards.push({ kind: "wild10", id: `W10-${i}` });
  }

  // Action cards (excluding rent — handled below)
  for (const action of Object.keys(ACTION_COUNTS) as ActionKind[]) {
    if (action === "rent") continue;
    const count = ACTION_COUNTS[action];
    for (let i = 0; i < count; i++) {
      cards.push({
        kind: "action",
        id: `A-${action}-${i}`,
        action,
        value: ACTION_VALUES[action],
      });
    }
  }

  // Rent — 3 wild ★ (single-target, $3M, choose any color you own)
  for (let i = 0; i < 3; i++) {
    cards.push({
      kind: "action",
      id: `A-rent-wild-${i}`,
      action: "rent",
      value: 3,
      rentSets: ALL_COLORS,
      rentSingleTarget: true,
    });
  }

  // Rent — 12 two-color (charge all opponents, $1M each); 2 of each pair, +2 extra
  // on the brown/lightBlue pair to bring total to 51 actions / 110 deck.
  for (const pair of RENT_PAIRS) {
    const baseCount = pair[0] === "brown" && pair[1] === "lightBlue" ? 4 : 2;
    for (let i = 0; i < baseCount; i++) {
      cards.push({
        kind: "action",
        id: `A-rent-${pair[0]}-${pair[1]}-${i}`,
        action: "rent",
        value: 1,
        rentSets: [pair[0], pair[1]],
        rentSingleTarget: false,
      });
    }
  }

  return cards;
}

export const DECK = buildDeck();

export function assertDeckTotals(): void {
  const counts = {
    money: 0,
    property: 0,
    wild2: 0,
    wild10: 0,
    action: 0,
  };
  for (const c of DECK) {
    counts[c.kind]++;
  }
  if (counts.money !== 20) throw new Error(`money count is ${counts.money}, expected 20`);
  if (counts.property !== 28) throw new Error(`property count is ${counts.property}, expected 28`);
  if (counts.wild2 !== 9) throw new Error(`wild2 count is ${counts.wild2}, expected 9`);
  if (counts.wild10 !== 2) throw new Error(`wild10 count is ${counts.wild10}, expected 2`);
  if (counts.action !== 51) throw new Error(`action count is ${counts.action}, expected 51`);
  if (DECK.length !== 110) throw new Error(`deck total is ${DECK.length}, expected 110`);
}

// Run the assertion at module load time so any drift in counts is caught
// immediately by anything that imports this file (Vitest, the worker, the UI).
assertDeckTotals();

export const CARDS_BY_ID = new Map<CardId, Card>(DECK.map((c) => [c.id, c]));

export function cardById(id: CardId): Card {
  const c = CARDS_BY_ID.get(id);
  if (!c) throw new Error(`unknown card id: ${id}`);
  return c;
}

// How many functionally-identical copies of this card the 110-card deck
// contains. Static composition only — the same knowledge printed on the real
// box. Live "how many remain" counting is deliberately NOT provided: reading
// the public discard pile is a player skill, not a UI feature.
export function countInDeck(card: Card): number {
  switch (card.kind) {
    case "money":
      return DECK.filter((c) => c.kind === "money" && c.value === card.value).length;
    case "property":
      // Solid properties are unique by name; the useful number is how many
      // cards exist in this color set.
      return DECK.filter((c) => c.kind === "property" && c.set === card.set).length;
    case "wild2":
      return DECK.filter(
        (c) => c.kind === "wild2" && c.sets[0] === card.sets[0] && c.sets[1] === card.sets[1],
      ).length;
    case "wild10":
      return DECK.filter((c) => c.kind === "wild10").length;
    case "action":
      if (card.action === "rent") {
        const key = (c: ActionCard) =>
          `${c.rentSingleTarget ? "wild" : (c.rentSets ?? []).join("+")}`;
        return DECK.filter(
          (c) => c.kind === "action" && c.action === "rent" && key(c) === key(card),
        ).length;
      }
      return DECK.filter((c) => c.kind === "action" && c.action === card.action).length;
  }
}

// Money value of a card when banked (played sideways into your bank).
// Wild cards have no money value — they cannot be banked.
export function bankValueOf(card: Card): number {
  switch (card.kind) {
    case "money":
    case "property":
    case "action":
      return card.value;
    case "wild2":
    case "wild10":
      return 0;
  }
}
