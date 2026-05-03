"use client";

import { motion } from "motion/react";
import Link from "next/link";
import { useEffect } from "react";

import { PlayerAvatar } from "./PlayerAvatar";
import { PropertySetsView } from "./PropertySetsView";
import { Button } from "./ui/Button";
import { SET_DEFS } from "@/engine/cards";
import { useGame } from "@/lib/gameStore";
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
    <main className="flex min-h-dvh flex-col items-center gap-7 p-6 text-center">
      <header className="mt-8 flex flex-col items-center gap-3">
        <div className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--color-ink-soft)]">
          That's the game!
        </div>
        <div className="relative">
          {/* Soft gold radial glow behind the trophy */}
          <span
            aria-hidden
            className="absolute inset-0 -z-10 m-auto h-32 w-32 rounded-full bg-[var(--color-gold)]/30 blur-3xl"
          />
          <motion.h1
            initial={{ scale: 0.4, opacity: 0, rotate: -8 }}
            animate={{ scale: 1, opacity: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 220, damping: 11, mass: 0.9 }}
            className="font-display text-5xl font-bold tracking-tight sm:text-6xl"
          >
            <span aria-hidden className="mr-3">🏆</span>
            <span className="rr-foil">{winner?.name ?? "Game over"}!</span>
          </motion.h1>
        </div>
        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.45, duration: 0.3 }}
          className="font-display text-base italic text-[var(--color-ink-soft)]"
        >
          Three colors. Three sets. Game over.
        </motion.p>
      </header>

      <section className="flex w-full max-w-3xl flex-col gap-3">
        {ranked.map((p, i) => {
          const isWin = p.id === state.winnerId;
          const completed = completedCount(p);
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
                "surface-paper flex flex-col gap-2 rounded-2xl p-4 text-left",
                isWin
                  ? "ring-2 ring-[var(--color-gold)] ring-offset-2 ring-offset-[var(--color-bg)]"
                  : "",
              ].join(" ")}
              data-testid={`results-row-${i}`}
            >
              <div className="flex items-center justify-between gap-3">
                <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-[var(--color-ink)]">
                  <PlayerAvatar id={p.id} name={p.name} />
                  <span>
                    <span aria-hidden className="mr-1">
                      {medal(i)}
                    </span>
                    {p.name}
                  </span>
                  {isWin && (
                    <span className="rounded-full bg-[var(--color-gold)] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--color-inked)]">
                      Winner
                    </span>
                  )}
                </h2>
                <span className="text-xs font-semibold text-[var(--color-ink-soft)]">
                  {completed} complete set{completed === 1 ? "" : "s"}
                </span>
              </div>
              {p.propertySets.length > 0 ? (
                <PropertySetsView propertySets={p.propertySets} compact playerId={p.id} />
              ) : (
                <div className="text-xs italic text-[var(--color-ink-faint)]">
                  no properties
                </div>
              )}
            </motion.article>
          );
        })}
      </section>

      <Link href="/" data-testid="back-home" className="mt-2">
        <Button variant="primary" size="lg">
          Back to home
        </Button>
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
