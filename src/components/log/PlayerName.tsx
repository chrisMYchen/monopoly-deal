"use client";

import type { ProjectedGameState } from "@/engine/project";
import { colorForPlayerId } from "@/lib/playerColor";

// Render a player's name with their stable per-id accent color so log rows
// stay scannable when several players act in succession. Falls back to the
// raw id when the player isn't found (paranoia for stale logs after a
// disconnect).
export function PlayerName({
  id,
  state,
  selfId,
  bold = true,
}: {
  id: string;
  state: ProjectedGameState;
  selfId?: string;
  bold?: boolean;
}) {
  const player = state.players.find((p) => p.id === id);
  const label = id === selfId ? "You" : player?.name ?? id;
  const color = colorForPlayerId(id);
  return (
    <span
      className={[
        "inline-flex items-center gap-1 whitespace-nowrap",
        bold ? "font-semibold" : "",
      ].join(" ")}
    >
      <span
        aria-hidden
        className={`h-1.5 w-1.5 rounded-full ${color.solid}`}
      />
      {label}
    </span>
  );
}
