"use client";

import { motion } from "motion/react";
import Link from "next/link";
import { useEffect } from "react";

import { PlayerAvatar } from "./PlayerAvatar";
import { PropertySetsView } from "./PropertySetsView";
import { SET_DEFS } from "@/engine/cards";
import { useGame } from "@/lib/gameStore";
import { colorForPlayerId } from "@/lib/playerColor";
import { playSfx } from "@/lib/animations/audio";
import { winRoll } from "@/lib/animations/confetti";
import { haptics } from "@/lib/animations/haptics";

export function ResultsScreen() {
  const state = useGame((s) => s.state);

  // Win celebration on mount: confetti roll + win SFX + success haptic.
  // The AnimationLayer also fires for the `win` log event during the
  // playing→ended transition; this re-fire is the safety net for users
  // who land directly on the results screen via reconnect.
  useEffect(() => {
    if (!state || state.phase !== "ended") return;
    const timer = window.setTimeout(() => {
      winRoll();
      playSfx("win");
      haptics.success();
    }, 120);
    return () => window.clearTimeout(timer);
  }, [state]);

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
        <motion.h1
          initial={{ scale: 0.4, opacity: 0, rotate: -8 }}
          animate={{ scale: 1, opacity: 1, rotate: 0 }}
          transition={{ type: "spring", stiffness: 220, damping: 11, mass: 0.9 }}
          className="mt-2 text-5xl font-bold tracking-tight drop-shadow-[0_0_22px_rgba(250,204,21,0.4)]"
        >
          🏆 {winner?.name ?? "Game over"}!
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.45, duration: 0.3 }}
          className="mt-2 opacity-70"
        >
          Three sets, three colors, total dominance.
        </motion.p>
      </header>

      <section className="flex w-full max-w-3xl flex-col gap-3">
        {ranked.map((p, i) => {
          const isWin = p.id === state.winnerId;
          const completed = completedCount(p);
          const color = colorForPlayerId(p.id);
          return (
            <motion.article
              key={p.id}
              initial={{ opacity: 0, x: -16 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{
                delay: 0.55 + i * 0.08,
                type: "spring",
                stiffness: 280,
                damping: 22,
              }}
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
              {p.propertySets.length > 0 ? (
                <PropertySetsView propertySets={p.propertySets} compact playerId={p.id} />
              ) : (
                <div className="text-xs opacity-50">no properties</div>
              )}
            </motion.article>
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

function completedCount(p: { propertySets: Array<{ color: string; cardIds: unknown[] }> }): number {
  return p.propertySets.filter(
    (g) => g.cardIds.length >= SET_DEFS[g.color as keyof typeof SET_DEFS].complete,
  ).length;
}

function medal(rank: number): string {
  if (rank === 0) return "🥇";
  if (rank === 1) return "🥈";
  if (rank === 2) return "🥉";
  return `${rank + 1}.`;
}
