// Sim policies. `randomValidPolicy` is the original biased-random; `greedyPolicy`
// is a heuristic that completes sets, blocks opponents close to winning, and
// banks low-value cards. Both share the legal-move enumerator below — in 110-
// card Monopoly Deal "all legal moves" is at most a few hundred items, so the
// brute-force enumeration is cheap enough to recompute every action.

import {
  ALL_COLORS,
  SET_DEFS,
  STANDARD_COLORS,
  bankValueOf,
  cardById,
} from "@/engine/cards";
import { pickAutoDiscard, pickAutoPayment } from "@/engine/autoAction";
import type { Action } from "@/engine/reduce";
import type { ProjectedGameState, ProjectedPlayer } from "@/engine/project";
import type { PlayerId } from "@/engine/state";

// Mulberry32 — same family as the engine's RNG. Only used for tie-breaking
// inside policies, never for game-state randomness.
function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Policy = (
  state: ProjectedGameState,
  selfId: PlayerId,
) => Action | null;

// ---------------------------------------------------------------------------
// Pending decisions
// ---------------------------------------------------------------------------

// The seat's response when the game is awaiting a decision from them.
// `playJsnIfTargeted` is the probability of playing a JSN card (when held)
// against an action targeted at us.
function pendingResponse(
  state: ProjectedGameState,
  selfId: PlayerId,
  rand: () => number,
  playJsnIfTargeted: number,
): Action | null {
  const p = state.pending;
  if (!p) return null;

  if (p.kind === "awaitJustSayNo") {
    const expected = p.responderIsActor
      ? p.declaration.sourceId
      : p.pendingDefenders[0];
    if (expected !== selfId) return null;
    const player = state.players.find((pp) => pp.id === selfId);
    if (!player) return null;
    const jsnCards = player.hand.filter((cid) => {
      const c = cardById(cid);
      return c.kind === "action" && c.action === "justSayNo";
    });
    if (jsnCards.length > 0 && rand() < playJsnIfTargeted) {
      return {
        type: "RESPOND_JSN",
        playerId: selfId,
        play: true,
        cardId: jsnCards[0]!,
      };
    }
    return { type: "RESPOND_JSN", playerId: selfId, play: false };
  }
  if (p.kind === "awaitPayment") {
    if (p.payerId !== selfId) return null;
    const me = state.players.find((pp) => pp.id === selfId);
    if (!me) return null;
    const cardIds = pickAutoPayment(me as never, p.amountOwed);
    return { type: "PAY", playerId: selfId, cardIds };
  }
  if (p.kind === "awaitDiscardToLimit") {
    if (p.playerId !== selfId) return null;
    const me = state.players.find((pp) => pp.id === selfId);
    if (!me) return null;
    const cardIds = pickAutoDiscard(me.hand, p.mustDiscard);
    return { type: "DISCARD_TO_LIMIT", playerId: selfId, cardIds };
  }
  // awaitWildAssignment has no engine action; the orchestrator falls back.
  return null;
}

// ---------------------------------------------------------------------------
// Legal-move enumeration (active turn only — pending decisions are above)
// ---------------------------------------------------------------------------

export function enumerateLegalMoves(
  state: ProjectedGameState,
  selfId: PlayerId,
): Action[] {
  if (state.phase !== "playing" || state.pending) return [];
  const onTurn = state.players[state.currentTurn];
  if (!onTurn || onTurn.id !== selfId) return [];
  if (!state.hasDrawnThisTurn) return [{ type: "DRAW_TURN_START", playerId: selfId }];
  if (state.playsRemaining <= 0) return [{ type: "END_TURN", playerId: selfId }];

  const me = state.players.find((pp) => pp.id === selfId);
  if (!me) return [];
  const opponents = state.players.filter((pp) => pp.id !== selfId);

  const moves: Action[] = [];

  for (const cid of me.hand) {
    const c = cardById(cid);

    if (c.kind === "property") {
      moves.push({
        type: "PLAY_PROPERTY",
        playerId: selfId,
        cardId: cid,
        assignedColor: c.set,
      });
      continue;
    }
    if (c.kind === "wild2") {
      for (const color of c.sets) {
        moves.push({
          type: "PLAY_PROPERTY",
          playerId: selfId,
          cardId: cid,
          assignedColor: color,
        });
      }
      continue;
    }
    if (c.kind === "wild10") {
      for (const color of ALL_COLORS) {
        const g = me.propertySets.find((gg) => gg.color === color);
        if (!g) continue;
        const hasNonRainbow = g.cardIds.some(
          (id) => cardById(id).kind !== "wild10",
        );
        if (!hasNonRainbow) continue;
        moves.push({
          type: "PLAY_PROPERTY",
          playerId: selfId,
          cardId: cid,
          assignedColor: color,
        });
      }
      continue;
    }
    if (c.kind === "money") {
      moves.push({ type: "PLAY_AS_MONEY", playerId: selfId, cardId: cid });
      continue;
    }
    if (c.kind === "action") {
      moves.push({ type: "PLAY_AS_MONEY", playerId: selfId, cardId: cid });
      switch (c.action) {
        case "passGo":
          moves.push({ type: "PLAY_PASS_GO", playerId: selfId, cardId: cid });
          break;
        case "house":
          for (const g of me.propertySets) {
            if (!STANDARD_COLORS.includes(g.color)) continue;
            if (g.cardIds.length < SET_DEFS[g.color].complete) continue;
            if (g.hasHouse) continue;
            moves.push({
              type: "PLAY_HOUSE",
              playerId: selfId,
              cardId: cid,
              targetColor: g.color,
            });
          }
          break;
        case "hotel":
          for (const g of me.propertySets) {
            if (!STANDARD_COLORS.includes(g.color)) continue;
            if (g.cardIds.length < SET_DEFS[g.color].complete) continue;
            if (!g.hasHouse || g.hasHotel) continue;
            moves.push({
              type: "PLAY_HOTEL",
              playerId: selfId,
              cardId: cid,
              targetColor: g.color,
            });
          }
          break;
        case "birthday":
          if (opponents.length > 0) {
            moves.push({ type: "PLAY_BIRTHDAY", playerId: selfId, cardId: cid });
          }
          break;
        case "debtCollector":
          for (const opp of opponents) {
            moves.push({
              type: "PLAY_DEBT_COLLECTOR",
              playerId: selfId,
              cardId: cid,
              targetPlayerId: opp.id,
            });
          }
          break;
        case "slyDeal":
          for (const opp of opponents) {
            for (const g of opp.propertySets) {
              if (g.cardIds.length >= SET_DEFS[g.color].complete) continue;
              for (const tcid of g.cardIds) {
                moves.push({
                  type: "PLAY_SLY_DEAL",
                  playerId: selfId,
                  cardId: cid,
                  targetPlayerId: opp.id,
                  targetCardId: tcid,
                });
              }
            }
          }
          break;
        case "forcedDeal":
          for (const myG of me.propertySets) {
            if (myG.cardIds.length >= SET_DEFS[myG.color].complete) continue;
            for (const myCid of myG.cardIds) {
              for (const opp of opponents) {
                for (const oppG of opp.propertySets) {
                  if (oppG.cardIds.length >= SET_DEFS[oppG.color].complete) continue;
                  for (const oppCid of oppG.cardIds) {
                    moves.push({
                      type: "PLAY_FORCED_DEAL",
                      playerId: selfId,
                      cardId: cid,
                      myCardId: myCid,
                      targetPlayerId: opp.id,
                      targetCardId: oppCid,
                    });
                  }
                }
              }
            }
          }
          break;
        case "dealBreaker":
          for (const opp of opponents) {
            for (let gIdx = 0; gIdx < opp.propertySets.length; gIdx++) {
              const g = opp.propertySets[gIdx]!;
              if (g.cardIds.length < SET_DEFS[g.color].complete) continue;
              moves.push({
                type: "PLAY_DEAL_BREAKER",
                playerId: selfId,
                cardId: cid,
                targetPlayerId: opp.id,
                targetColor: g.color,
                targetGroupIdx: gIdx,
              });
            }
          }
          break;
        case "rent":
          if (c.rentSets) {
            for (const color of c.rentSets) {
              const myG = me.propertySets.find((gg) => gg.color === color);
              if (!myG || myG.cardIds.length === 0) continue;
              if (c.rentSingleTarget) {
                for (const opp of opponents) {
                  moves.push({
                    type: "PLAY_RENT",
                    playerId: selfId,
                    cardId: cid,
                    color,
                    singleTargetId: opp.id,
                  });
                }
              } else {
                moves.push({
                  type: "PLAY_RENT",
                  playerId: selfId,
                  cardId: cid,
                  color,
                });
              }
            }
          }
          break;
        // doubleRent, justSayNo — response-only; not playable as a turn action.
      }
    }
  }
  return moves;
}

// Mirror of engine/autoAction#onClockPlayerId for ProjectedGameState.
export function whoActsNow(state: ProjectedGameState): PlayerId | null {
  if (state.phase !== "playing") return null;
  const p = state.pending;
  if (!p) return state.players[state.currentTurn]?.id ?? null;
  switch (p.kind) {
    case "awaitDiscardToLimit":
      return p.playerId;
    case "awaitJustSayNo":
      return p.responderIsActor
        ? p.declaration.sourceId
        : (p.pendingDefenders[0] ?? null);
    case "awaitPayment":
      return p.payerId;
    case "awaitWildAssignment":
      return p.ownerId;
  }
}

// ---------------------------------------------------------------------------
// Random-valid policy (with progress bias)
// ---------------------------------------------------------------------------

export function randomValidPolicy(seed: number): Policy {
  const rand = makeRng(seed);
  const pick = <T>(arr: T[]): T | null =>
    arr.length === 0 ? null : arr[Math.floor(rand() * arr.length)] ?? null;

  return (state, selfId): Action | null => {
    if (state.phase !== "playing") return null;

    if (state.pending) return pendingResponse(state, selfId, rand, 0.3);

    const moves = enumerateLegalMoves(state, selfId);
    if (moves.length === 0) return null;

    // Single-action shortcuts.
    if (moves.length === 1) return moves[0]!;

    const propertyPlays = moves.filter((m) => m.type === "PLAY_PROPERTY");
    if (propertyPlays.length > 0 && rand() < 0.92) {
      const p = pick(propertyPlays);
      if (p) return p;
    }
    const constructive = moves.filter(
      (m) =>
        m.type === "PLAY_HOUSE" ||
        m.type === "PLAY_HOTEL" ||
        m.type === "PLAY_PASS_GO" ||
        m.type === "PLAY_RENT" ||
        m.type === "PLAY_BIRTHDAY" ||
        m.type === "PLAY_DEBT_COLLECTOR",
    );
    if (constructive.length > 0 && rand() < 0.5) {
      const p = pick(constructive);
      if (p) return p;
    }
    const disruptive = moves.filter(
      (m) =>
        m.type === "PLAY_DEAL_BREAKER" ||
        m.type === "PLAY_SLY_DEAL" ||
        m.type === "PLAY_FORCED_DEAL",
    );
    if (disruptive.length > 0 && rand() < 0.15) {
      const p = pick(disruptive);
      if (p) return p;
    }
    const m = pick(moves);
    if (m) return m;
    return { type: "END_TURN", playerId: selfId };
  };
}

// ---------------------------------------------------------------------------
// Greedy heuristic policy
// ---------------------------------------------------------------------------

// Counts complete-set colors for a player (the win condition is >= 3 distinct
// complete colors). Mirrors the engine's checkWin logic.
function distinctCompleted(player: ProjectedPlayer): number {
  const seen = new Set<string>();
  for (const g of player.propertySets) {
    if (g.cardIds.length >= SET_DEFS[g.color].complete) seen.add(g.color);
  }
  return seen.size;
}

// Count of cards toward the most-complete same-color group for `color`.
function progressToward(player: ProjectedPlayer, color: string): number {
  let best = 0;
  for (const g of player.propertySets) {
    if (g.color !== color) continue;
    if (g.cardIds.length > best) best = g.cardIds.length;
  }
  return best;
}

// Greedy score: higher is better. The constants are deliberately loose —
// we want clear hierarchy (winning > blocking > progress > banking), not
// fine-grained tuning.
function scoreMove(
  move: Action,
  state: ProjectedGameState,
  selfId: PlayerId,
): number {
  const me = state.players.find((p) => p.id === selfId);
  if (!me) return 0;
  const opponents = state.players.filter((p) => p.id !== selfId);
  const myCompleted = distinctCompleted(me);

  switch (move.type) {
    case "DRAW_TURN_START":
      return 1; // mandatory.
    case "END_TURN":
      // Lowest priority — only if nothing else.
      return -1;

    case "PLAY_PROPERTY": {
      // Bigger reward when the play completes a set; smaller when it just
      // progresses toward one. Prefer plays that move us closer to 3 sets.
      const color = move.assignedColor;
      const def = SET_DEFS[color];
      const before = progressToward(me, color);
      const after = before + 1;
      let score = 50 + after * 5;
      if (after >= def.complete) score += 200; // completes the set
      if (after >= def.complete && myCompleted + 1 >= 3) score += 1000; // wins
      // Slight preference for completing a 2-card set (brown/darkBlue/util)
      // because they're cheaper.
      if (def.complete === 2) score += 5;
      return score;
    }

    case "PLAY_HOUSE":
      return 60; // boosts future rent income.
    case "PLAY_HOTEL":
      return 70;
    case "PLAY_PASS_GO":
      return 55; // free draw is high-value early.

    case "PLAY_DEAL_BREAKER": {
      // Block-the-leader: highest priority if any opponent has >=2 complete
      // sets (one more = they win). Lower otherwise.
      const target = opponents.find((o) => o.id === move.targetPlayerId);
      if (!target) return 0;
      const tCompleted = distinctCompleted(target);
      let score = 80;
      if (tCompleted >= 2) score = 800; // urgent
      else if (tCompleted >= 1) score = 100;
      return score;
    }
    case "PLAY_RENT": {
      // Rent value scales with # cards in target color set.
      const myG = me.propertySets.find((g) => g.color === move.color);
      const owned = myG ? myG.cardIds.length : 0;
      return 30 + owned * 6;
    }
    case "PLAY_BIRTHDAY":
      return 25;
    case "PLAY_DEBT_COLLECTOR":
      return 30;
    case "PLAY_SLY_DEAL":
      return 35;
    case "PLAY_FORCED_DEAL":
      return 40;

    case "PLAY_AS_MONEY": {
      // Bank cheap stuff; high-value cards stay usable longer. Negative
      // bias so we only bank when no constructive play exists.
      const card = cardById(move.cardId);
      const v = bankValueOf(card);
      return 5 - v; // bank $1M as 4, $10M as -5
    }

    case "REASSIGN_WILD":
      return 45;
    default:
      return 0;
  }
}

export function greedyPolicy(seed: number): Policy {
  const rand = makeRng(seed);
  return (state, selfId): Action | null => {
    if (state.phase !== "playing") return null;
    if (state.pending) {
      // Greedy plays JSN aggressively against deal-breakers/forced-deals,
      // less so against minor actions.
      const p = state.pending;
      if (p.kind === "awaitJustSayNo") {
        const targetedAtMe =
          p.declaration.sourceId !== selfId &&
          (("targetId" in p.declaration && p.declaration.targetId === selfId) ||
            (p.declaration.kind === "birthday") ||
            (p.declaration.kind === "rent" &&
              p.declaration.targetIds.includes(selfId)));
        const kind = p.declaration.kind;
        const aggression =
          kind === "dealBreaker"
            ? 0.95
            : kind === "forcedDeal"
              ? 0.7
              : kind === "slyDeal"
                ? 0.5
                : kind === "rent"
                  ? 0.3
                  : 0.15;
        return pendingResponse(state, selfId, rand, targetedAtMe ? aggression : 0.05);
      }
      return pendingResponse(state, selfId, rand, 0.3);
    }

    const moves = enumerateLegalMoves(state, selfId);
    if (moves.length === 0) return null;
    if (moves.length === 1) return moves[0]!;

    // Score everything; pick best (random tie-breaker for jitter).
    let best: { score: number; move: Action } | null = null;
    for (const m of moves) {
      const s = scoreMove(m, state, selfId) + rand() * 0.5;
      if (!best || s > best.score) best = { score: s, move: m };
    }
    return best?.move ?? moves[0]!;
  };
}
