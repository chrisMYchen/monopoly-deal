"use client";

import Link from "next/link";

import { PlayerAvatar } from "./PlayerAvatar";
import { TableauView } from "./TableauView";
import { SET_DEFS } from "@/engine/cards";
import { useGame } from "@/lib/gameStore";
import { colorForPlayerId } from "@/lib/playerColor";

export function ResultsScreen() {
  const state = useGame((s) => s.state);
  if (!state) return null;

  const winner = state.players.find((p) => p.id === state.winnerId);
  // Sort: winner first, then by completed-set count (a rough leaderboard).
  const ranked = [...state.players].sort((a, b) => {
    if (a.id === state.winnerId) return -1;
    if (b.id === state.winnerId) return 1;
    return completedCount(b) - completedCount(a);
  });

  return (
    <main className="flex min-h-dvh flex-col items-center gap-6 p-6 text-center">
      <header className="mt-6">
        <div className="text-sm uppercase tracking-widest opacity-60">Game over</div>
        <h1 className="mt-2 text-5xl font-bold tracking-tight">
          🏆 {winner?.name ?? "Game over"}!
        </h1>
        <p className="mt-2 opacity-70">Three sets, three colors, total dominance.</p>
      </header>

      <section className="flex w-full max-w-3xl flex-col gap-3">
        {ranked.map((p, i) => {
          const isWin = p.id === state.winnerId;
          const completed = completedCount(p);
          const color = colorForPlayerId(p.id);
          return (
            <article
              key={p.id}
              className={[
                "flex flex-col gap-2 rounded-md border p-3 text-left",
                isWin ? "border-yellow-300/60 bg-yellow-300/10" : `${color.border} ${color.bg}`,
              ].join(" ")}
              data-testid={`results-row-${i}`}
            >
              <div className="flex items-center justify-between">
                <h2 className="flex items-center gap-2 text-lg font-semibold">
                  <PlayerAvatar id={p.id} name={p.name} />
                  <span>{medal(i)} {p.name}</span>
                </h2>
                <span className="text-xs opacity-70">
                  {completed} complete set{completed === 1 ? "" : "s"}
                </span>
              </div>
              {p.tableau.length > 0 ? (
                <TableauView tableau={p.tableau} compact />
              ) : (
                <div className="text-xs opacity-50">no properties</div>
              )}
            </article>
          );
        })}
      </section>

      <Link
        href="/"
        className="rounded-md bg-white/90 px-5 py-2 font-semibold text-zinc-900"
        data-testid="back-home"
      >
        Back to home
      </Link>
    </main>
  );
}

function completedCount(p: { tableau: Array<{ color: string; cardIds: unknown[] }> }): number {
  return p.tableau.filter(
    (g) => g.cardIds.length >= SET_DEFS[g.color as keyof typeof SET_DEFS].complete,
  ).length;
}

function medal(rank: number): string {
  if (rank === 0) return "🥇";
  if (rank === 1) return "🥈";
  if (rank === 2) return "🥉";
  return `${rank + 1}.`;
}
