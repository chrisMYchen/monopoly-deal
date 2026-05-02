// Project authoritative GameState into a per-player view. Hides other players'
// hand contents (replaces them with just a count). Used by the server to filter
// what each socket receives.

import type { CardId } from "./cards";
import type { GameState, PlayerId } from "./state";

export type ProjectedPlayer = {
  id: PlayerId;
  name: string;
  // Self → full hand; others → empty array (handCount carries the size).
  hand: CardId[];
  handCount: number;
  bank: CardId[];
  tableau: GameState["players"][number]["tableau"];
  connected: boolean;
};

export type ProjectedGameState = Omit<GameState, "players" | "drawPile" | "discardPile"> & {
  players: ProjectedPlayer[];
  drawPileCount: number;
  // Discard pile is public per Hasbro — at the table any player can shuffle
  // through it to count cards. We send the full ordered list so experts can
  // count consumed action cards (e.g., "how many JSNs left in the deck?").
  discardPile: CardId[];
  discardTopCardId: CardId | null;
  discardCount: number;
  // The viewing player's id (echoed for convenience).
  selfId: PlayerId;
};

export function projectStateForPlayer(state: GameState, selfId: PlayerId): ProjectedGameState {
  const players: ProjectedPlayer[] = state.players.map((p) => {
    const isSelf = p.id === selfId;
    return {
      id: p.id,
      name: p.name,
      hand: isSelf ? [...p.hand] : [],
      handCount: p.hand.length,
      bank: [...p.bank],
      tableau: p.tableau.map((g) => ({ ...g, cardIds: [...g.cardIds] })),
      connected: p.connected,
    };
  });

  return {
    phase: state.phase,
    currentTurn: state.currentTurn,
    playsRemaining: state.playsRemaining,
    hasDrawnThisTurn: state.hasDrawnThisTurn,
    drawPileCount: state.drawPile.length,
    discardPile: [...state.discardPile],
    discardTopCardId:
      state.discardPile.length > 0 ? state.discardPile[state.discardPile.length - 1]! : null,
    discardCount: state.discardPile.length,
    pending: state.pending,
    log: [...state.log],
    rngState: 0, // never expose RNG seed to clients
    winnerId: state.winnerId,
    players,
    selfId,
  };
}
