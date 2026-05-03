"use client";

import { motion } from "motion/react";
import Link from "next/link";
import { useEffect } from "react";

import { MrMonopoly } from "./ui/MrMonopoly";
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
          Game over
        </div>
        <motion.h1
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 220, damping: 16, mass: 0.85 }}
          className="font-display text-5xl font-bold tracking-tight text-[var(--color-ink)] sm:text-6xl"
        >
          <span aria-hidden className="mr-3">🏆</span>
          {winner?.name ?? "Game over"}
        </motion.h1>
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
                delay: 0.4 + i * 0.07,
                type: "spring",
                stiffness: 280,
                damping: 22,
              }}
              className={[
                "relative flex flex-col gap-2 overflow-hidden rounded-2xl p-4 text-left",
                isWin
                  ? "border-2 border-[var(--color-accent)] bg-[var(--color-accent-tint)]"
                  : "border border-[var(--color-ink)]/12 bg-[var(--color-card)]",
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
                    <>
                      <MrMonopoly
                        variant="tipHat"
                        size={28}
                        className="text-[var(--color-ink)]"
                      />
                      <span className="rounded-full bg-[var(--color-accent)] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--color-ink-on-dark)]">
                        Winner
                      </span>
                    </>
                  )}
                </h2>
                <span className="text-xs font-semibold text-[var(--color-ink-soft)]">
                  {completed} complete set{completed === 1 ? "" : "s"}
                </span>
              </div>
              {p.propertySets.length > 0 ? (
                <PropertySetsView propertySets={p.propertySets} compact playerId={p.id} />
              ) : (
                <div className="text-xs text-[var(--color-ink-faint)]">no properties</div>
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
