import { produce } from "immer";

import {
  ALL_COLORS,
  DECK,
  SET_DEFS,
  SET_LABEL,
  STANDARD_COLORS,
  bankValueOf,
  cardById,
  type ActionCard,
  type CardId,
  type SetColor,
} from "./cards";
import {
  ALLOWED_TURN_TIMER_SECONDS,
  DEFAULT_TURN_TIMER_SECONDS,
  findGroup,
  findGroupIndex,
  type DeclaredAction,
  type GameState,
  type LogEvent,
  type Pending,
  type Player,
  type PlayerId,
  type RoomSettings,
  type PropertySet,
} from "./state";
import { shuffle } from "./rng";

// ---------------------------------------------------------------------------
// Action types accepted by the reducer
// ---------------------------------------------------------------------------

export type Action =
  | { type: "START_GAME"; rngSeed: number; players: { id: PlayerId; name: string }[] }
  | { type: "DRAW_TURN_START"; playerId: PlayerId }
  | { type: "PLAY_PROPERTY"; playerId: PlayerId; cardId: CardId; assignedColor: SetColor }
  | { type: "PLAY_AS_MONEY"; playerId: PlayerId; cardId: CardId }
  | { type: "PLAY_HOUSE"; playerId: PlayerId; cardId: CardId; targetColor: SetColor }
  | { type: "PLAY_HOTEL"; playerId: PlayerId; cardId: CardId; targetColor: SetColor }
  | { type: "PLAY_PASS_GO"; playerId: PlayerId; cardId: CardId }
  | { type: "REASSIGN_WILD"; playerId: PlayerId; cardId: CardId; fromColor: SetColor; toColor: SetColor }
  | { type: "PLAY_SLY_DEAL"; playerId: PlayerId; cardId: CardId; targetPlayerId: PlayerId; targetCardId: CardId }
  | {
      type: "PLAY_FORCED_DEAL";
      playerId: PlayerId;
      cardId: CardId;
      myCardId: CardId;
      targetPlayerId: PlayerId;
      targetCardId: CardId;
    }
  | {
      type: "PLAY_DEAL_BREAKER";
      playerId: PlayerId;
      cardId: CardId;
      targetPlayerId: PlayerId;
      targetColor: SetColor;
      targetGroupIdx: number;
    }
  | { type: "PLAY_DEBT_COLLECTOR"; playerId: PlayerId; cardId: CardId; targetPlayerId: PlayerId }
  | { type: "PLAY_BIRTHDAY"; playerId: PlayerId; cardId: CardId }
  | {
      type: "PLAY_RENT";
      playerId: PlayerId;
      cardId: CardId;
      color: SetColor;
      doubleRentCardIds?: CardId[];
      // Required when the rent card is a wild ★ (single-target). Ignored otherwise.
      singleTargetId?: PlayerId;
    }
  | { type: "RESPOND_JSN"; playerId: PlayerId; play: boolean; cardId?: CardId }
  | { type: "PAY"; playerId: PlayerId; cardIds: CardId[] }
  | { type: "DISCARD_TO_LIMIT"; playerId: PlayerId; cardIds: CardId[] }
  | { type: "END_TURN"; playerId: PlayerId }
  | { type: "UPDATE_SETTINGS"; playerId: PlayerId; settings: Partial<RoomSettings> };

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const HAND_LIMIT = 7;
const TURN_DRAW = 2;
const EMPTY_HAND_DRAW = 5;
const PLAYS_PER_TURN = 3;
const DEBT_COLLECTOR_AMOUNT = 5;
const BIRTHDAY_AMOUNT = 2;

// ---------------------------------------------------------------------------
// Validation errors
// ---------------------------------------------------------------------------

export class RuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RuleError";
  }
}

// ---------------------------------------------------------------------------
// Set-completion delta tracking (for animation cues)
// ---------------------------------------------------------------------------

// Snapshot every player's currently-complete set colors. The reducer captures
// this before any operation that can change tableau composition and diffs
// against it afterward to emit setComplete / setBroken events. Pure data,
// engine-side; the client uses these to fire celebration / shake effects.
type CompletionSnapshot = Map<PlayerId, Set<SetColor>>;

function snapshotCompletions(s: GameState): CompletionSnapshot {
  const out: CompletionSnapshot = new Map();
  for (const p of s.players) {
    const colors = new Set<SetColor>();
    for (const g of p.propertySets) {
      if (g.cardIds.length >= SET_DEFS[g.color].complete) colors.add(g.color);
    }
    out.set(p.id, colors);
  }
  return out;
}

function emitCompletionDeltas(s: GameState, before: CompletionSnapshot): void {
  for (const p of s.players) {
    const beforeColors = before.get(p.id) ?? new Set<SetColor>();
    const afterColors = new Set<SetColor>();
    for (const g of p.propertySets) {
      if (g.cardIds.length >= SET_DEFS[g.color].complete) afterColors.add(g.color);
    }
    for (const color of afterColors) {
      if (!beforeColors.has(color)) {
        s.log.push({
          at: s.currentTurn,
          message: `${p.name} completed the ${color} set!`,
          event: { kind: "setComplete", actorId: p.id, color },
        });
      }
    }
    for (const color of beforeColors) {
      if (!afterColors.has(color)) {
        s.log.push({
          at: s.currentTurn,
          message: `${p.name}'s ${color} set was broken.`,
          event: { kind: "setBroken", actorId: p.id, color },
        });
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function applyAction(state: GameState, action: Action): GameState {
  return produce(state, (draft) => {
    reduce(draft, action);
  });
}

// ---------------------------------------------------------------------------
// Internal reducer
// ---------------------------------------------------------------------------

function reduce(s: GameState, a: Action): void {
  switch (a.type) {
    case "START_GAME":
      return startGame(s, a);
    case "DRAW_TURN_START":
      return drawTurnStart(s, a);
    case "PLAY_PROPERTY":
      return playProperty(s, a);
    case "PLAY_AS_MONEY":
      return playAsMoney(s, a);
    case "PLAY_HOUSE":
      return playHouseOrHotel(s, a, "house");
    case "PLAY_HOTEL":
      return playHouseOrHotel(s, a, "hotel");
    case "PLAY_PASS_GO":
      return playPassGo(s, a);
    case "REASSIGN_WILD":
      return reassignWild(s, a);
    case "PLAY_SLY_DEAL":
      return playSlyDeal(s, a);
    case "PLAY_FORCED_DEAL":
      return playForcedDeal(s, a);
    case "PLAY_DEAL_BREAKER":
      return playDealBreaker(s, a);
    case "PLAY_DEBT_COLLECTOR":
      return playDebtCollector(s, a);
    case "PLAY_BIRTHDAY":
      return playBirthday(s, a);
    case "PLAY_RENT":
      return playRent(s, a);
    case "RESPOND_JSN":
      return respondJsn(s, a);
    case "PAY":
      return pay(s, a);
    case "DISCARD_TO_LIMIT":
      return discardToLimit(s, a);
    case "END_TURN":
      return endTurn(s, a);
    case "UPDATE_SETTINGS":
      return updateSettings(s, a);
  }
}

// ---------------------------------------------------------------------------
// UPDATE_SETTINGS — host-configurable lobby settings (host check is server-side)
// ---------------------------------------------------------------------------

function updateSettings(
  s: GameState,
  a: Extract<Action, { type: "UPDATE_SETTINGS" }>,
): void {
  if (s.phase !== "lobby") {
    throw new RuleError("settings can only change in the lobby");
  }
  const next = a.settings;
  if (next.turnTimerSeconds !== undefined) {
    if (!ALLOWED_TURN_TIMER_SECONDS.includes(next.turnTimerSeconds)) {
      throw new RuleError("invalid turn timer value");
    }
    s.settings.turnTimerSeconds = next.turnTimerSeconds;
  }
}

// ---------------------------------------------------------------------------
// START_GAME
// ---------------------------------------------------------------------------

function startGame(
  s: GameState,
  a: Extract<Action, { type: "START_GAME" }>,
): void {
  if (s.phase !== "lobby") throw new RuleError("game already started");
  if (a.players.length < 2 || a.players.length > 5) {
    throw new RuleError("need 2..5 players");
  }

  const { items: shuffled, nextSeed } = shuffle(
    DECK.map((c) => c.id),
    a.rngSeed,
  );

  s.players = a.players.map((p) => ({
    id: p.id,
    name: p.name,
    hand: [],
    bank: [],
    propertySets: [],
    connected: true,
  }));

  for (let dealRound = 0; dealRound < 5; dealRound++) {
    for (const player of s.players) {
      const cardId = shuffled.shift();
      if (!cardId) throw new RuleError("deck underflow during deal");
      player.hand.push(cardId);
    }
  }

  s.drawPile = shuffled;
  s.discardPile = [];
  s.currentTurn = 0;
  s.playsRemaining = PLAYS_PER_TURN;
  s.hasDrawnThisTurn = false;
  s.pending = null;
  s.phase = "playing";
  s.log = [
    {
      at: 0,
      message: `Game started with ${s.players.length} players.`,
      event: { kind: "gameStart", count: s.players.length },
    },
  ];
  s.rngState = nextSeed;
}

// ---------------------------------------------------------------------------
// Turn-start draw
// ---------------------------------------------------------------------------

function drawTurnStart(
  s: GameState,
  a: Extract<Action, { type: "DRAW_TURN_START" }>,
): void {
  assertPlaying(s);
  assertActorsTurn(s, a.playerId);
  if (s.hasDrawnThisTurn) throw new RuleError("already drew this turn");

  const player = currentPlayer(s);
  const drawCount = player.hand.length === 0 ? EMPTY_HAND_DRAW : TURN_DRAW;
  drawCardsInto(s, player, drawCount);
  s.hasDrawnThisTurn = true;
  s.log.push({
    at: s.currentTurn,
    message: `${player.name} drew ${drawCount}.`,
    event: { kind: "draw", actorId: player.id, count: drawCount },
  });
}

// ---------------------------------------------------------------------------
// PLAY_PROPERTY (solid, wild2, wild10)
// ---------------------------------------------------------------------------

function playProperty(
  s: GameState,
  a: Extract<Action, { type: "PLAY_PROPERTY" }>,
): void {
  assertPlayingPhase(s);
  assertActorsTurn(s, a.playerId);
  assertHasDrawn(s);
  assertPlaysRemaining(s);

  const before = snapshotCompletions(s);
  const player = currentPlayer(s);
  removeFromHand(player, a.cardId);

  const card = cardById(a.cardId);
  switch (card.kind) {
    case "property":
      if (card.set !== a.assignedColor) {
        throw new RuleError("solid property must be played to its own color");
      }
      placeIntoProperties(player, a.cardId, card.set);
      break;
    case "wild2":
      if (!card.sets.includes(a.assignedColor)) {
        throw new RuleError("wild2 cannot be assigned to this color");
      }
      placeIntoProperties(player, a.cardId, a.assignedColor);
      break;
    case "wild10":
      if (!ALL_COLORS.includes(a.assignedColor)) {
        throw new RuleError("invalid color for rainbow wild");
      }
      assertRainbowAttachable(player, a.assignedColor);
      placeIntoProperties(player, a.cardId, a.assignedColor);
      break;
    default:
      throw new RuleError("not a property-class card");
  }

  s.playsRemaining -= 1;
  s.log.push({
    at: s.currentTurn,
    message: `${player.name} placed a property in ${a.assignedColor}.`,
    event: {
      kind: "playProperty",
      actorId: player.id,
      cardId: a.cardId,
      color: a.assignedColor,
    },
  });

  emitCompletionDeltas(s, before);
  checkWin(s);
}

function assertRainbowAttachable(player: Player, color: SetColor): void {
  const group = findGroup(player, color);
  if (!group) throw new RuleError("rainbow wild needs an existing color group");
  const hasNonRainbow = group.cardIds.some((id) => {
    const c = cardById(id);
    return c.kind !== "wild10";
  });
  if (!hasNonRainbow) {
    throw new RuleError("rainbow wild cannot stand alone — group has only rainbow wilds");
  }
}

function placeIntoProperties(player: Player, cardId: CardId, color: SetColor): void {
  const def = SET_DEFS[color];
  // One set per color. New cards always extend the existing same-color group;
  // a complete set growing past `def.complete` (overcomplete: 4/3, 5/3, etc.)
  // is intentional — wildcards in the set may leave later via REASSIGN_WILD,
  // and Deal Breaker / rent treat the whole group as one set. If multiple
  // same-color groups already exist (e.g., from a Deal Breaker steal stacked
  // on top of an existing set), prefer attaching to a partial group so plays
  // progress toward completion instead of bloating a complete one.
  const sameColor = player.propertySets.filter((g) => g.color === color);
  let target: PropertySet | undefined;
  if (sameColor.length > 0) {
    const partials = sameColor.filter((g) => g.cardIds.length < def.complete);
    if (partials.length > 0) {
      target = partials.reduce((best, g) =>
        g.cardIds.length > best.cardIds.length ? g : best,
      );
    } else {
      target = sameColor[0]!;
    }
  }
  if (!target) {
    target = { color, cardIds: [], hasHouse: false, hasHotel: false };
    player.propertySets.push(target);
  }
  target.cardIds.push(cardId);
}

// ---------------------------------------------------------------------------
// PLAY_AS_MONEY
// ---------------------------------------------------------------------------

function playAsMoney(
  s: GameState,
  a: Extract<Action, { type: "PLAY_AS_MONEY" }>,
): void {
  assertPlayingPhase(s);
  assertActorsTurn(s, a.playerId);
  assertHasDrawn(s);
  assertPlaysRemaining(s);

  const player = currentPlayer(s);
  const card = cardById(a.cardId);

  if (card.kind === "wild2" || card.kind === "wild10") {
    throw new RuleError("wild cards cannot be played into the bank");
  }
  if (card.kind === "property") {
    throw new RuleError("solid properties cannot be banked as money");
  }

  removeFromHand(player, a.cardId);
  player.bank.push(a.cardId);
  s.playsRemaining -= 1;
  s.log.push({
    at: s.currentTurn,
    message: `${player.name} banked $${bankValueOf(card)}M.`,
    event: {
      kind: "playMoney",
      actorId: player.id,
      cardId: a.cardId,
      amount: bankValueOf(card),
    },
  });
}

// ---------------------------------------------------------------------------
// PLAY_HOUSE / PLAY_HOTEL
// ---------------------------------------------------------------------------

function playHouseOrHotel(
  s: GameState,
  a: Extract<Action, { type: "PLAY_HOUSE" | "PLAY_HOTEL" }>,
  expected: "house" | "hotel",
): void {
  assertPlayingPhase(s);
  assertActorsTurn(s, a.playerId);
  assertHasDrawn(s);
  assertPlaysRemaining(s);

  const player = currentPlayer(s);
  const card = cardById(a.cardId);
  if (card.kind !== "action" || card.action !== expected) {
    throw new RuleError(`card is not a ${expected}`);
  }

  if (!STANDARD_COLORS.includes(a.targetColor)) {
    throw new RuleError(`${expected} cannot be played on RR/Utility`);
  }

  const group = findGroup(player, a.targetColor);
  if (!group) throw new RuleError("no such group");
  if (group.cardIds.length < SET_DEFS[a.targetColor].complete) {
    throw new RuleError(`${expected} requires a complete set`);
  }

  if (expected === "house") {
    if (group.hasHouse) throw new RuleError("set already has a house");
    group.hasHouse = true;
  } else {
    if (!group.hasHouse) throw new RuleError("hotel requires a house first");
    if (group.hasHotel) throw new RuleError("set already has a hotel");
    group.hasHotel = true;
  }

  removeFromHand(player, a.cardId);
  s.playsRemaining -= 1;
  s.log.push({
    at: s.currentTurn,
    message: `${player.name} placed a ${expected} on ${a.targetColor}.`,
    event: {
      kind: expected,
      actorId: player.id,
      cardId: a.cardId,
      color: a.targetColor,
    },
  });
}

// ---------------------------------------------------------------------------
// PLAY_PASS_GO
// ---------------------------------------------------------------------------

function playPassGo(
  s: GameState,
  a: Extract<Action, { type: "PLAY_PASS_GO" }>,
): void {
  assertPlayingPhase(s);
  assertActorsTurn(s, a.playerId);
  assertHasDrawn(s);
  assertPlaysRemaining(s);

  const player = currentPlayer(s);
  const card = cardById(a.cardId);
  if (card.kind !== "action" || card.action !== "passGo") {
    throw new RuleError("card is not Pass Go");
  }

  removeFromHand(player, a.cardId);
  s.discardPile.push(a.cardId);
  drawCardsInto(s, player, 2);
  s.playsRemaining -= 1;
  s.log.push({
    at: s.currentTurn,
    message: `${player.name} played Pass Go (+2).`,
    event: { kind: "passGo", actorId: player.id, cardId: a.cardId, count: 2 },
  });
}

// ---------------------------------------------------------------------------
// REASSIGN_WILD
// ---------------------------------------------------------------------------

function reassignWild(
  s: GameState,
  a: Extract<Action, { type: "REASSIGN_WILD" }>,
): void {
  // Reassignment is free in real Monopoly Deal — it doesn't consume one of
  // the 3 plays per turn, so no playsRemaining check or decrement here.
  assertPlayingPhase(s);
  assertActorsTurn(s, a.playerId);
  assertHasDrawn(s);

  const before = snapshotCompletions(s);
  const player = currentPlayer(s);
  const card = cardById(a.cardId);
  if (card.kind !== "wild2" && card.kind !== "wild10") {
    throw new RuleError("only wilds can be reassigned");
  }
  if (card.kind === "wild2") {
    if (!card.sets.includes(a.toColor)) {
      throw new RuleError("wild2 cannot be reassigned to this color");
    }
  } else {
    if (!ALL_COLORS.includes(a.toColor)) {
      throw new RuleError("invalid target color");
    }
  }

  const fromIdx = findGroupIndex(player, a.fromColor);
  if (fromIdx === -1) throw new RuleError("source group missing");
  const fromGroup = player.propertySets[fromIdx]!;
  const cardIdx = fromGroup.cardIds.indexOf(a.cardId);
  if (cardIdx === -1) throw new RuleError("wild not in source group");

  fromGroup.cardIds.splice(cardIdx, 1);
  detachHouseHotelIfBroken(s, player, fromIdx);

  if (card.kind === "wild10") {
    assertRainbowAttachable(player, a.toColor);
  }
  placeIntoProperties(player, a.cardId, a.toColor);

  s.log.push({
    at: s.currentTurn,
    message: `${player.name} moved a wild from ${a.fromColor} to ${a.toColor}.`,
    event: {
      kind: "reassignWild",
      actorId: player.id,
      cardId: a.cardId,
      color: a.toColor,
    },
  });

  emitCompletionDeltas(s, before);
  checkWin(s);
}

// ---------------------------------------------------------------------------
// Targeted action cards (with JSN windows)
// ---------------------------------------------------------------------------

function playSlyDeal(
  s: GameState,
  a: Extract<Action, { type: "PLAY_SLY_DEAL" }>,
): void {
  const { source, card } = startTargetedAction(s, a.playerId, a.cardId, "slyDeal");
  const target = playerById(s, a.targetPlayerId);
  if (target.id === source.id) throw new RuleError("cannot target yourself");
  const { groupIdx } = findCardInProperties(target, a.targetCardId);
  if (groupIdx === -1) throw new RuleError("target card not in opponent's properties");
  const group = target.propertySets[groupIdx]!;
  if (isGroupComplete(group)) throw new RuleError("cannot Sly Deal a complete set");

  removeFromHand(source, a.cardId);
  openJsnWindow(s, {
    declaration: { kind: "slyDeal", sourceId: source.id, targetId: target.id, targetCardId: a.targetCardId },
    actionCardId: a.cardId,
    defenders: [target.id],
  });
  s.log.push({
    at: s.currentTurn,
    message: `${source.name} plays Sly Deal on ${target.name}.`,
    event: {
      kind: "slyDeal",
      actorId: source.id,
      targetId: target.id,
      cardId: a.cardId,
    },
  });
  // Note: card consumes 1 play. Plays decrement when JSN window resolves.
}

function playForcedDeal(
  s: GameState,
  a: Extract<Action, { type: "PLAY_FORCED_DEAL" }>,
): void {
  const { source, card } = startTargetedAction(s, a.playerId, a.cardId, "forcedDeal");
  const target = playerById(s, a.targetPlayerId);
  if (target.id === source.id) throw new RuleError("cannot target yourself");

  // Validate "my" card is in source's properties and not in a complete set.
  const my = findCardInProperties(source, a.myCardId);
  if (my.groupIdx === -1) throw new RuleError("my card not in your properties");
  if (isGroupComplete(source.propertySets[my.groupIdx]!)) {
    throw new RuleError("cannot Forced Deal from your own complete set");
  }
  // Validate target card.
  const t = findCardInProperties(target, a.targetCardId);
  if (t.groupIdx === -1) throw new RuleError("target card not in opponent's properties");
  if (isGroupComplete(target.propertySets[t.groupIdx]!)) {
    throw new RuleError("cannot Forced Deal opponent's complete set");
  }

  removeFromHand(source, a.cardId);
  openJsnWindow(s, {
    declaration: {
      kind: "forcedDeal",
      sourceId: source.id,
      targetId: target.id,
      sourceCardId: a.myCardId,
      targetCardId: a.targetCardId,
    },
    actionCardId: a.cardId,
    defenders: [target.id],
  });
  s.log.push({
    at: s.currentTurn,
    message: `${source.name} plays Forced Deal on ${target.name}.`,
    event: {
      kind: "forcedDeal",
      actorId: source.id,
      targetId: target.id,
      cardId: a.cardId,
    },
  });
}

function playDealBreaker(
  s: GameState,
  a: Extract<Action, { type: "PLAY_DEAL_BREAKER" }>,
): void {
  const { source } = startTargetedAction(s, a.playerId, a.cardId, "dealBreaker");
  const target = playerById(s, a.targetPlayerId);
  if (target.id === source.id) throw new RuleError("cannot target yourself");

  const group = target.propertySets[a.targetGroupIdx];
  if (!group || group.color !== a.targetColor) {
    throw new RuleError("target group not found");
  }
  if (!isGroupComplete(group)) {
    throw new RuleError("Deal Breaker requires a complete set");
  }

  removeFromHand(source, a.cardId);
  openJsnWindow(s, {
    declaration: {
      kind: "dealBreaker",
      sourceId: source.id,
      targetId: target.id,
      targetColor: a.targetColor,
      targetGroupIdx: a.targetGroupIdx,
    },
    actionCardId: a.cardId,
    defenders: [target.id],
  });
  s.log.push({
    at: s.currentTurn,
    message: `${source.name} plays Deal Breaker on ${target.name}'s ${a.targetColor}.`,
    event: {
      kind: "dealBreaker",
      actorId: source.id,
      targetId: target.id,
      cardId: a.cardId,
      color: a.targetColor,
    },
  });
}

function playDebtCollector(
  s: GameState,
  a: Extract<Action, { type: "PLAY_DEBT_COLLECTOR" }>,
): void {
  const { source } = startTargetedAction(s, a.playerId, a.cardId, "debtCollector");
  const target = playerById(s, a.targetPlayerId);
  if (target.id === source.id) throw new RuleError("cannot target yourself");

  removeFromHand(source, a.cardId);
  openJsnWindow(s, {
    declaration: { kind: "debtCollector", sourceId: source.id, targetId: target.id },
    actionCardId: a.cardId,
    defenders: [target.id],
  });
  s.log.push({
    at: s.currentTurn,
    message: `${source.name} plays Debt Collector on ${target.name} ($${DEBT_COLLECTOR_AMOUNT}M).`,
    event: {
      kind: "debtCollector",
      actorId: source.id,
      targetId: target.id,
      cardId: a.cardId,
      amount: DEBT_COLLECTOR_AMOUNT,
    },
  });
}

function playBirthday(
  s: GameState,
  a: Extract<Action, { type: "PLAY_BIRTHDAY" }>,
): void {
  const { source } = startTargetedAction(s, a.playerId, a.cardId, "birthday");
  const opponents = s.players.filter((p) => p.id !== source.id).map((p) => p.id);
  if (opponents.length === 0) throw new RuleError("no opponents to charge");

  removeFromHand(source, a.cardId);
  openJsnWindow(s, {
    declaration: { kind: "birthday", sourceId: source.id },
    actionCardId: a.cardId,
    defenders: opponents,
  });
  s.log.push({
    at: s.currentTurn,
    message: `${source.name} plays It's My Birthday — every opponent owes $${BIRTHDAY_AMOUNT}M.`,
    event: {
      kind: "birthday",
      actorId: source.id,
      targetIds: opponents,
      cardId: a.cardId,
      amount: BIRTHDAY_AMOUNT,
    },
  });
}

function playRent(
  s: GameState,
  a: Extract<Action, { type: "PLAY_RENT" }>,
): void {
  const { source } = startTargetedAction(s, a.playerId, a.cardId, "rent");
  const card = cardById(a.cardId);
  if (card.kind !== "action" || card.action !== "rent") {
    throw new RuleError("card is not a Rent card");
  }
  if (!card.rentSets || !card.rentSets.includes(a.color)) {
    throw new RuleError("this Rent card does not cover that color");
  }

  // Validate source owns at least one of that color and rent > 0.
  const baseRent = rentFor(source, a.color);
  if (baseRent <= 0) throw new RuleError("you have no properties of that color");

  // Resolve Double The Rent stacks.
  const doubleIds = a.doubleRentCardIds ?? [];
  if (doubleIds.length > 2) throw new RuleError("at most 2 Double The Rent cards");
  for (const did of doubleIds) {
    const dc = cardById(did);
    if (dc.kind !== "action" || dc.action !== "doubleRent") {
      throw new RuleError("Double The Rent card mismatch");
    }
    if (!source.hand.includes(did)) {
      throw new RuleError("Double The Rent card not in hand");
    }
  }
  // Total play cost = 1 (rent) + N (doubles); must be <= playsRemaining.
  const playCost = 1 + doubleIds.length;
  if (playCost > s.playsRemaining) {
    throw new RuleError(`needs ${playCost} plays, ${s.playsRemaining} remaining`);
  }
  const multiplier = 1 << doubleIds.length; // 1, 2, or 4

  // Determine targets.
  let targetIds: PlayerId[];
  if (card.rentSingleTarget) {
    if (!a.singleTargetId) throw new RuleError("wild rent needs a target");
    if (a.singleTargetId === source.id) throw new RuleError("cannot target yourself");
    targetIds = [a.singleTargetId];
  } else {
    targetIds = s.players.filter((p) => p.id !== source.id).map((p) => p.id);
  }
  if (targetIds.length === 0) throw new RuleError("no opponents to charge");

  removeFromHand(source, a.cardId);
  for (const did of doubleIds) {
    removeFromHand(source, did);
    s.discardPile.push(did);
  }

  // We track that this play consumed `playCost` by initializing the JSN window
  // with the multi-play cost; resolution path will subtract `playCost` from
  // playsRemaining at JSN-window close.
  openJsnWindow(s, {
    declaration: {
      kind: "rent",
      sourceId: source.id,
      color: a.color,
      multiplier,
      baseRent,
      targetIds,
    },
    actionCardId: a.cardId,
    defenders: targetIds,
    playCost,
  });
  s.log.push({
    at: s.currentTurn,
    message:
      `${source.name} plays Rent on ${a.color}` +
      (multiplier > 1 ? ` (×${multiplier})` : "") +
      ` — owes $${baseRent * multiplier}M per target.`,
    event: {
      kind: "rent",
      actorId: source.id,
      targetIds,
      cardId: a.cardId,
      color: a.color,
      amount: baseRent * multiplier,
      multiplier,
    },
  });
}

// ---------------------------------------------------------------------------
// JSN — RESPOND_JSN
// ---------------------------------------------------------------------------

function respondJsn(
  s: GameState,
  a: Extract<Action, { type: "RESPOND_JSN" }>,
): void {
  if (s.pending?.kind !== "awaitJustSayNo") {
    throw new RuleError("no JSN window open");
  }
  const w = s.pending;
  // Whose turn is it to act? If responderIsActor is false, the current defender
  // (pendingDefenders[0]) acts; if true, the source acts.
  const expectedActor = w.responderIsActor ? w.declaration.sourceId : w.pendingDefenders[0];
  if (a.playerId !== expectedActor) throw new RuleError("not your JSN window");

  if (a.play) {
    if (!a.cardId) throw new RuleError("must specify which JSN card");
    const player = playerById(s, a.playerId);
    const card = cardById(a.cardId);
    if (card.kind !== "action" || card.action !== "justSayNo") {
      throw new RuleError("not a Just Say No card");
    }
    if (!player.hand.includes(a.cardId)) {
      throw new RuleError("Just Say No not in hand");
    }
    removeFromHand(player, a.cardId);
    s.discardPile.push(a.cardId);
    w.jsnStack.push(a.playerId);
    w.responderIsActor = !w.responderIsActor;
    s.log.push({
      at: s.currentTurn,
      message: `${player.name} plays Just Say No.`,
      event: {
        kind: "justSayNo",
        actorId: player.id,
        targetId: w.declaration.sourceId,
        cardId: a.cardId,
      },
    });
    return; // window stays open; the other side decides next
  }

  // Pass: this defender chose not to JSN now. Resolve current defender.
  const declaration = w.declaration;
  const defenderId = w.pendingDefenders[0]!;
  const proceeds = w.jsnStack.length % 2 === 0; // even = action sticks
  // Pop this defender from queue.
  w.pendingDefenders.shift();

  if (proceeds) {
    applySingleEffect(s, declaration, defenderId);
    // applySingleEffect may have transitioned pending to awaitPayment for this
    // defender. If it did, return — the player will resolve via PAY action.
    if ((s.pending as Pending | null)?.kind === "awaitPayment") return;
  } else {
    s.log.push({
      at: s.currentTurn,
      message: `Action against ${playerById(s, defenderId).name} canceled.`,
      event: {
        kind: "jsnCanceled",
        actorId: declaration.sourceId,
        targetId: defenderId,
      },
    });
  }

  // If more defenders remain, open the next JSN window for the next defender.
  if (w.pendingDefenders.length > 0) {
    s.pending = {
      kind: "awaitJustSayNo",
      declaration,
      actionCardId: w.actionCardId,
      pendingDefenders: w.pendingDefenders,
      jsnStack: [],
      responderIsActor: false,
      playCost: w.playCost,
      remainingDemands: w.remainingDemands,
    };
    return;
  }

  // No more defenders — close out the action.
  finalizeTargetedAction(s, w.actionCardId, w.playCost);
}

// ---------------------------------------------------------------------------
// PAY
// ---------------------------------------------------------------------------

function pay(
  s: GameState,
  a: Extract<Action, { type: "PAY" }>,
): void {
  if (s.pending?.kind !== "awaitPayment") throw new RuleError("no payment due");
  const p = s.pending;
  if (p.payerId !== a.playerId) throw new RuleError("not your payment");

  const payer = playerById(s, a.playerId);
  const payee = playerById(s, p.payeeId);

  // Validate selected cards are all in payer's bank or properties.
  for (const cid of a.cardIds) {
    const inBank = payer.bank.includes(cid);
    let inProperties = false;
    for (const g of payer.propertySets) if (g.cardIds.includes(cid)) inProperties = true;
    if (!inBank && !inProperties) {
      throw new RuleError(`card ${cid} not in payer's bank or properties`);
    }
  }
  // Validate uniqueness.
  const seen = new Set<CardId>();
  for (const cid of a.cardIds) {
    if (seen.has(cid)) throw new RuleError("duplicate card in payment");
    seen.add(cid);
  }

  // Compute total offered.
  let offered = 0;
  for (const cid of a.cardIds) offered += bankValueOf(cardById(cid));
  // Houses/Hotels: when paying with a house/hotel attached card, treat them as
  // separate transferable entries — but our current model has them as flags on
  // groups, not card ids. Keep simple: H/H cannot be itemized in payment in
  // this version (player must pay around them). Future: allow paying H/H by
  // detaching them deterministically. Documented in plan §"Open verification".

  // Per Hasbro: payer's max-payable equals their net worth; if amountOwed
  // exceeds that, payer pays all they have.
  const netWorthBefore = payer.bank.length + payer.propertySets.reduce((s2, g) => s2 + g.cardIds.length, 0);

  if (netWorthBefore === 0) {
    // Truly empty — debt forgiven.
    s.log.push({
      at: s.currentTurn,
      message: `${payer.name} has nothing — debt forgiven.`,
      event: { kind: "debtForgiven", actorId: payer.id, targetId: payee.id },
    });
    advancePaymentQueue(s, p);
    return;
  }

  // If undercoverage but payer still has assets, all chosen cards must be paid;
  // we require that the offered set EITHER >= owed, OR includes ALL of payer's
  // bank + properties (i.e. they paid everything they have).
  const totalAssetCount =
    payer.bank.length + payer.propertySets.reduce((s2, g) => s2 + g.cardIds.length, 0);
  const allInBankOrProperties = a.cardIds.length === totalAssetCount;
  if (offered < p.amountOwed && !allInBankOrProperties) {
    throw new RuleError(
      `payment of $${offered}M is short of $${p.amountOwed}M and not all assets offered`,
    );
  }

  // Transfer the cards. Properties retain their identity.
  const before = snapshotCompletions(s);
  for (const cid of a.cardIds) {
    transferOneCard(s, payer, payee, cid);
  }
  const paidAmount = Math.min(offered, p.amountOwed);
  s.log.push({
    at: s.currentTurn,
    message: `${payer.name} paid ${payee.name} $${paidAmount}M+ (${a.cardIds.length} cards).`,
    event: {
      kind: "pay",
      actorId: payer.id,
      targetId: payee.id,
      cardIds: [...a.cardIds],
      amount: paidAmount,
      count: a.cardIds.length,
    },
  });

  emitCompletionDeltas(s, before);
  advancePaymentQueue(s, p);
  checkWin(s);
}

// Move payment processing to the next defender (or finalize the action).
function advancePaymentQueue(
  s: GameState,
  p: Extract<Pending, { kind: "awaitPayment" }>,
): void {
  if (p.remainingDemands.length === 0) {
    finalizeTargetedAction(s, p.actionCardId, p.playCost);
    return;
  }

  const [next, ...rest] = p.remainingDemands;

  s.pending = {
    kind: "awaitJustSayNo",
    declaration: p.declaration,
    actionCardId: p.actionCardId,
    pendingDefenders: [next!.payerId],
    jsnStack: [],
    responderIsActor: false,
    playCost: p.playCost,
    remainingDemands: rest,
  };
}

// ---------------------------------------------------------------------------
// Apply effect of a successful targeted action against ONE defender.
// May transition pending to awaitPayment.
// ---------------------------------------------------------------------------

function applySingleEffect(
  s: GameState,
  declaration: DeclaredAction,
  defenderId: PlayerId,
): void {
  const source = playerById(s, declaration.sourceId);
  const defender = playerById(s, defenderId);
  switch (declaration.kind) {
    case "slyDeal": {
      const t = findCardInProperties(defender, declaration.targetCardId);
      if (t.groupIdx === -1) return; // already moved? skip silently
      const before = snapshotCompletions(s);
      transferPropertyCard(s, defender, source, declaration.targetCardId);
      s.log.push({
        at: s.currentTurn,
        message: `${source.name} stole a property from ${defender.name}.`,
        event: {
          kind: "slyDeal",
          actorId: source.id,
          targetId: defender.id,
          cardId: declaration.targetCardId,
        },
      });
      emitCompletionDeltas(s, before);
      return;
    }
    case "forcedDeal": {
      // Swap the two cards.
      const fromMy = findCardInProperties(source, declaration.sourceCardId);
      const fromTheirs = findCardInProperties(defender, declaration.targetCardId);
      if (fromMy.groupIdx === -1 || fromTheirs.groupIdx === -1) return;
      const gaveFromColor = source.propertySets[fromMy.groupIdx]!.color;
      const tookFromColor = defender.propertySets[fromTheirs.groupIdx]!.color;
      const gaveLabel = describeCardForLog(declaration.sourceCardId, gaveFromColor);
      const tookLabel = describeCardForLog(declaration.targetCardId, tookFromColor);
      const before = snapshotCompletions(s);
      transferPropertyCard(s, source, defender, declaration.sourceCardId);
      transferPropertyCard(s, defender, source, declaration.targetCardId);
      s.log.push({
        at: s.currentTurn,
        message: `${source.name} gave ${gaveLabel} and took ${tookLabel} from ${defender.name}.`,
        event: {
          kind: "forcedDeal",
          actorId: source.id,
          targetId: defender.id,
          cardIds: [declaration.sourceCardId, declaration.targetCardId],
        },
        swap: {
          sourceId: source.id,
          targetId: defender.id,
          gaveCardId: declaration.sourceCardId,
          tookCardId: declaration.targetCardId,
          gaveFromColor,
          tookFromColor,
        },
      });
      emitCompletionDeltas(s, before);
      return;
    }
    case "dealBreaker": {
      // Move all card ids in the group + house/hotel state to source.
      const groupIdx = declaration.targetGroupIdx;
      const group = defender.propertySets[groupIdx];
      if (!group) return;
      const before = snapshotCompletions(s);
      // Place a fresh group on source's side preserving house/hotel.
      const newGroup: PropertySet = {
        color: group.color,
        cardIds: [...group.cardIds],
        hasHouse: group.hasHouse,
        hasHotel: group.hasHotel,
      };
      const stolenCardIds = [...group.cardIds];
      source.propertySets.push(newGroup);
      defender.propertySets.splice(groupIdx, 1);
      s.log.push({
        at: s.currentTurn,
        message: `${source.name} stole ${defender.name}'s ${group.color} set.`,
        event: {
          kind: "dealBreaker",
          actorId: source.id,
          targetId: defender.id,
          color: group.color,
          cardIds: stolenCardIds,
        },
      });
      emitCompletionDeltas(s, before);
      return;
    }
    case "debtCollector": {
      transitionToPayment(s, source, defender, DEBT_COLLECTOR_AMOUNT, declaration);
      return;
    }
    case "birthday": {
      transitionToPayment(s, source, defender, BIRTHDAY_AMOUNT, declaration);
      return;
    }
    case "rent": {
      // Use the rent amount captured at play time. Recomputing here would
      // mean defender B owes more if defender A paid with a same-color
      // property between their JSN windows — not how Monopoly Deal works.
      const totalDue = declaration.baseRent * declaration.multiplier;
      transitionToPayment(s, source, defender, totalDue, declaration);
      return;
    }
  }
}

function transitionToPayment(
  s: GameState,
  payee: Player,
  payer: Player,
  amount: number,
  declaration: DeclaredAction,
): void {
  // Two sources of "remaining" defenders to merge into this payment's queue:
  //   1) Defenders left in the in-flight JSN window (`pendingDefenders` after
  //      respondJsn already shifted the current one).
  //   2) Demands queued from a prior advancePaymentQueue cycle.
  const cur = s.pending;
  let restFromWindow: PlayerId[] = [];
  let actionCardId = "";
  let playCost = 1;
  let preCarried: { payerId: PlayerId; amountOwed: number }[] = [];
  if (cur && cur.kind === "awaitJustSayNo") {
    restFromWindow = [...cur.pendingDefenders];
    actionCardId = cur.actionCardId;
    playCost = cur.playCost;
    preCarried = cur.remainingDemands;
  }
  // For multi-target actions, every remaining defender owes the same amount as
  // the one we just resolved (Birthday / 2-color Rent). For single-target
  // actions (Sly Deal, Forced Deal, Deal Breaker, Debt Collector, ★ Rent),
  // `restFromWindow` is empty.
  const remainingDemands = [
    ...restFromWindow.map((pid) => ({ payerId: pid, amountOwed: amount })),
    ...preCarried,
  ];

  s.pending = {
    kind: "awaitPayment",
    payerId: payer.id,
    payeeId: payee.id,
    amountOwed: amount,
    remainingDemands,
    actionCardId,
    declaration,
    playCost,
  };
}

// ---------------------------------------------------------------------------
// Finalize: discard the action card, decrement plays, advance to next or end.
// ---------------------------------------------------------------------------

function finalizeTargetedAction(s: GameState, actionCardId: CardId, playCost: number): void {
  if (actionCardId) s.discardPile.push(actionCardId);
  s.playsRemaining -= playCost;
  s.pending = null;
  checkWin(s);
}

// ---------------------------------------------------------------------------
// JSN window helpers
// ---------------------------------------------------------------------------

function startTargetedAction(
  s: GameState,
  playerId: PlayerId,
  cardId: CardId,
  expected: ActionCard["action"],
): { source: Player; card: ActionCard } {
  assertPlayingPhase(s);
  assertActorsTurn(s, playerId);
  assertHasDrawn(s);
  assertPlaysRemaining(s);
  const source = currentPlayer(s);
  const card = cardById(cardId);
  if (card.kind !== "action" || card.action !== expected) {
    throw new RuleError(`card is not a ${expected}`);
  }
  if (!source.hand.includes(cardId)) throw new RuleError("card not in hand");
  return { source, card };
}

function openJsnWindow(
  s: GameState,
  args: {
    declaration: DeclaredAction;
    actionCardId: CardId;
    defenders: PlayerId[];
    playCost?: number;
  },
): void {
  s.pending = {
    kind: "awaitJustSayNo",
    declaration: args.declaration,
    actionCardId: args.actionCardId,
    pendingDefenders: args.defenders,
    jsnStack: [],
    responderIsActor: false,
    playCost: args.playCost ?? 1,
    remainingDemands: [],
  };
}

// ---------------------------------------------------------------------------
// DISCARD_TO_LIMIT
// ---------------------------------------------------------------------------

function discardToLimit(
  s: GameState,
  a: Extract<Action, { type: "DISCARD_TO_LIMIT" }>,
): void {
  if (s.pending?.kind !== "awaitDiscardToLimit") {
    throw new RuleError("not awaiting discard");
  }
  if (s.pending.playerId !== a.playerId) {
    throw new RuleError("not your discard");
  }
  if (a.cardIds.length !== s.pending.mustDiscard) {
    throw new RuleError(
      `must discard exactly ${s.pending.mustDiscard}, got ${a.cardIds.length}`,
    );
  }
  const player = s.players.find((p) => p.id === a.playerId);
  if (!player) throw new RuleError("unknown player");

  for (const cid of a.cardIds) {
    if (!player.hand.includes(cid)) {
      throw new RuleError(`card ${cid} not in hand`);
    }
  }

  for (const cid of a.cardIds) {
    removeFromHand(player, cid);
    s.discardPile.push(cid);
  }
  s.pending = null;

  advanceTurn(s);
}

// ---------------------------------------------------------------------------
// END_TURN
// ---------------------------------------------------------------------------

function endTurn(
  s: GameState,
  a: Extract<Action, { type: "END_TURN" }>,
): void {
  assertPlaying(s);
  assertActorsTurn(s, a.playerId);
  if (s.pending !== null) {
    throw new RuleError("cannot end turn while pending action");
  }
  if (!s.hasDrawnThisTurn && s.drawPile.length + s.discardPile.length > 0) {
    throw new RuleError("must draw before ending turn");
  }

  const player = currentPlayer(s);
  const overflow = player.hand.length - HAND_LIMIT;
  if (overflow > 0) {
    s.pending = {
      kind: "awaitDiscardToLimit",
      playerId: player.id,
      mustDiscard: overflow,
    };
    return;
  }
  advanceTurn(s);
}

function advanceTurn(s: GameState): void {
  s.currentTurn = (s.currentTurn + 1) % s.players.length;
  s.playsRemaining = PLAYS_PER_TURN;
  s.hasDrawnThisTurn = false;
  const next = currentPlayer(s);
  s.log.push({
    at: s.currentTurn,
    message: `${next.name}'s turn.`,
    event: { kind: "turnStart", actorId: next.id },
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function currentPlayer(s: GameState): Player {
  const p = s.players[s.currentTurn];
  if (!p) throw new RuleError("no current player");
  return p;
}

function playerById(s: GameState, id: PlayerId): Player {
  const p = s.players.find((p) => p.id === id);
  if (!p) throw new RuleError(`unknown player ${id}`);
  return p;
}

function assertPlaying(s: GameState): void {
  if (s.phase !== "playing") throw new RuleError("game is not in play");
}

function assertPlayingPhase(s: GameState): void {
  assertPlaying(s);
  if (s.pending !== null) {
    throw new RuleError(`cannot act while pending: ${s.pending.kind}`);
  }
}

function assertActorsTurn(s: GameState, playerId: PlayerId): void {
  const cp = currentPlayer(s);
  if (cp.id !== playerId) throw new RuleError("not your turn");
}

function assertHasDrawn(s: GameState): void {
  if (!s.hasDrawnThisTurn) throw new RuleError("must draw at start of turn");
}

function assertPlaysRemaining(s: GameState): void {
  if (s.playsRemaining <= 0) throw new RuleError("no plays remaining");
}

function removeFromHand(player: Player, cardId: CardId): void {
  const i = player.hand.indexOf(cardId);
  if (i === -1) throw new RuleError(`card ${cardId} not in hand`);
  player.hand.splice(i, 1);
}

// Compact, human-readable label for a property card used in the structured
// log. Properties carry their canonical name; wilds borrow the color of the
// group they currently sit in so log readers can disambiguate them.
function describeCardForLog(cardId: CardId, fromColor: SetColor): string {
  const c = cardById(cardId);
  if (c.kind === "property") return `${c.name} (${SET_LABEL[fromColor]})`;
  if (c.kind === "wild2") return `${SET_LABEL[fromColor]} Wild`;
  if (c.kind === "wild10") return `${SET_LABEL[fromColor]} ★ Wild`;
  return "card";
}

function findCardInProperties(player: Player, cardId: CardId): { groupIdx: number; cardIdx: number } {
  for (let g = 0; g < player.propertySets.length; g++) {
    const idx = player.propertySets[g]!.cardIds.indexOf(cardId);
    if (idx >= 0) return { groupIdx: g, cardIdx: idx };
  }
  return { groupIdx: -1, cardIdx: -1 };
}

function isGroupComplete(group: PropertySet): boolean {
  return group.cardIds.length >= SET_DEFS[group.color].complete;
}

// Move a single property card from one player to another, preserving wild
// color choice (the receiver can reassign on their next turn). For solid
// properties, the color is fixed by the card itself.
function transferPropertyCard(
  s: GameState,
  from: Player,
  to: Player,
  cardId: CardId,
): void {
  const where = findCardInProperties(from, cardId);
  if (where.groupIdx === -1) return;
  const group = from.propertySets[where.groupIdx]!;
  group.cardIds.splice(where.cardIdx, 1);
  detachHouseHotelIfBroken(s, from, where.groupIdx);

  const card = cardById(cardId);
  // Pick destination color. For solid: card.set. For wild2: keep current group's
  // color (pre-removal), but it's now in a different player's properties, so the
  // receiver may reassign on their turn. We default to the original color here
  // and let REASSIGN_WILD handle later moves. For wild10, similarly.
  let destColor: SetColor;
  if (card.kind === "property") destColor = card.set;
  else if (card.kind === "wild2") destColor = group.color;
  else if (card.kind === "wild10") destColor = group.color;
  else return; // shouldn't happen

  // For wild10 specifically, attaching to a same-color group is fine; if the
  // destination has no such group, it's still placed (forming a new group of
  // that color, even though "rainbow alone" rule would disallow on PLAY). The
  // rule applies on play, not on receipt; we mirror digital convention here.
  placeIntoProperties(to, cardId, destColor);
}

function transferOneCard(s: GameState, from: Player, to: Player, cardId: CardId): void {
  // Could be in bank or properties.
  const bankIdx = from.bank.indexOf(cardId);
  if (bankIdx >= 0) {
    from.bank.splice(bankIdx, 1);
    const card = cardById(cardId);
    if (card.kind === "property" || card.kind === "wild2" || card.kind === "wild10") {
      // Pay-with-property: lands in receiver's properties.
      const color = card.kind === "property" ? card.set : "brown"; // wilds default; receiver re-assigns
      placeIntoProperties(to, cardId, color);
    } else {
      to.bank.push(cardId);
    }
    return;
  }
  // Properties path.
  transferPropertyCard(s, from, to, cardId);
}

// Pull `count` cards into `player`. If the draw pile runs dry, reshuffle the
// discard pile in. If both are empty, draw stops short.
function drawCardsInto(s: GameState, player: Player, count: number): void {
  for (let i = 0; i < count; i++) {
    if (s.drawPile.length === 0) {
      if (s.discardPile.length === 0) return;
      const { items, nextSeed } = shuffle(s.discardPile, s.rngState);
      s.drawPile = items;
      s.discardPile = [];
      s.rngState = nextSeed;
      s.log.push({
        at: s.currentTurn,
        message: `Reshuffled discard into draw pile.`,
        event: { kind: "reshuffle" },
      });
    }
    const cid = s.drawPile.shift();
    if (!cid) return;
    player.hand.push(cid);
  }
}

function checkWin(s: GameState): void {
  if (s.pending !== null) return;
  for (const player of s.players) {
    const completedColors = new Set<SetColor>();
    for (const group of player.propertySets) {
      if (group.cardIds.length >= SET_DEFS[group.color].complete) {
        completedColors.add(group.color);
      }
    }
    if (completedColors.size >= 3) {
      s.phase = "ended";
      s.winnerId = player.id;
      s.log.push({
        at: s.currentTurn,
        message: `${player.name} wins with ${completedColors.size} complete sets!`,
        event: {
          kind: "win",
          actorId: player.id,
          count: completedColors.size,
        },
      });
      return;
    }
  }
}

function detachHouseHotelIfBroken(
  s: GameState,
  player: Player,
  groupIdx: number,
): void {
  const group = player.propertySets[groupIdx];
  if (!group) return;
  const def = SET_DEFS[group.color];
  if (group.cardIds.length >= def.complete) return;

  const inPlay = new Set<CardId>();
  for (const p of s.players) {
    for (const c of p.hand) inPlay.add(c);
    for (const c of p.bank) inPlay.add(c);
    for (const g of p.propertySets) for (const c of g.cardIds) inPlay.add(c);
  }
  for (const c of s.drawPile) inPlay.add(c);
  for (const c of s.discardPile) inPlay.add(c);

  if (group.hasHotel) {
    const hotel = freeActionCard(inPlay, "hotel");
    if (hotel) {
      player.bank.push(hotel);
      inPlay.add(hotel);
      group.hasHotel = false;
      s.log.push({
        at: s.currentTurn,
        message: `Hotel detached → bank.`,
        event: {
          kind: "hotelDetached",
          actorId: player.id,
          color: group.color,
          cardId: hotel,
        },
      });
    }
  }
  if (group.hasHouse) {
    const house = freeActionCard(inPlay, "house");
    if (house) {
      player.bank.push(house);
      group.hasHouse = false;
      s.log.push({
        at: s.currentTurn,
        message: `House detached → bank.`,
        event: {
          kind: "houseDetached",
          actorId: player.id,
          color: group.color,
          cardId: house,
        },
      });
    }
  }

  if (group.cardIds.length === 0) {
    player.propertySets.splice(groupIdx, 1);
  }
}

function freeActionCard(inPlay: Set<CardId>, kind: ActionCard["action"]): CardId | undefined {
  for (const c of DECK) {
    if (c.kind === "action" && c.action === kind && !inPlay.has(c.id)) {
      return c.id;
    }
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Initial state factory (lobby)
// ---------------------------------------------------------------------------

export function initialLobby(): GameState {
  return {
    phase: "lobby",
    players: [],
    currentTurn: 0,
    playsRemaining: 0,
    hasDrawnThisTurn: false,
    drawPile: [],
    discardPile: [],
    pending: null,
    log: [],
    rngState: 1,
    settings: { turnTimerSeconds: DEFAULT_TURN_TIMER_SECONDS },
  };
}

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

export function isComplete(group: PropertySet): boolean {
  return group.cardIds.length >= SET_DEFS[group.color].complete;
}

export function rentFor(player: Player, color: SetColor): number {
  const group = findGroup(player, color);
  if (!group || group.cardIds.length === 0) return 0;
  const def = SET_DEFS[color];
  const ladderIdx = Math.min(group.cardIds.length, def.complete) - 1;
  const base = def.rentLadder[ladderIdx] ?? 0;
  let rent = base;
  if (group.hasHouse) rent += 3;
  if (group.hasHotel) rent += 4;
  return rent;
}

export function netWorth(player: Player): number {
  let total = 0;
  for (const cid of player.bank) total += bankValueOf(cardById(cid));
  for (const group of player.propertySets) {
    for (const cid of group.cardIds) total += bankValueOf(cardById(cid));
    if (group.hasHouse) total += 3;
    if (group.hasHotel) total += 4;
  }
  return total;
}
