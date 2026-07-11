"use client";

import { useState } from "react";

import { Card, type CardSize } from "./Card";
import type { CardId } from "@/engine/cards";

// Center discard pile that expands to show every card discarded so far.
// Experts use this to count what's been spent (e.g., how many JSNs left in
// the deck). Beginners see what was just played.

const EMPTY_PLACEHOLDER: Record<CardSize, string> = {
  sm: "h-[88px] w-[64px]",
  md: "h-[140px] w-[100px]",
  lg: "h-[224px] w-[160px]",
};

export function DiscardPile({
  topCardId,
  count,
  // The full discard pile, oldest → newest. Server can send this as part of
  // the projected state; right now we only have top + count, so the expanded
  // view shows just the top card with a placeholder note. Future enhancement:
  // surface the full pile in projected state when needed.
  fullPile,
  size = "md",
  // Render as a small "🃏 5" chip instead of a card. Used in the mobile
  // cockpit so the felt's vertical budget goes to the player's hand and
  // properties — the discard top is already echoed in the recents ribbon.
  variant = "card",
}: {
  topCardId: CardId | null;
  count: number;
  fullPile?: CardId[];
  size?: CardSize;
  variant?: "card" | "chip";
}) {
  const [open, setOpen] = useState(false);
  const trigger =
    variant === "chip" ? (
      <button
        type="button"
        onClick={() => count > 0 && setOpen(true)}
        disabled={count === 0}
        className="inline-flex h-6 items-center gap-1 rounded-full border border-white/15 bg-white/5 px-2 text-xs font-medium text-white/80 transition hover:bg-white/10 disabled:opacity-50"
        aria-label={count > 0 ? `Discard pile, ${count} cards — tap to view` : "Discard pile, empty"}
        title={count > 0 ? "View discard pile" : "Discard pile is empty"}
        data-testid="discard-chip"
      >
        <span aria-hidden>🃏</span>
        <span className="tabular">{count}</span>
      </button>
    ) : (
      // Card renders its own <button>, so it must own the click — wrapping it
      // in another button is invalid HTML and triggers hydration errors.
      <div className="flex flex-col items-center gap-1">
        {topCardId ? (
          <Card
            cardId={topCardId}
            size={size}
            animated={false}
            onClick={count > 0 ? () => setOpen(true) : undefined}
            ariaLabel={`Discard pile, ${count} cards — tap to view`}
          />
        ) : (
          <div
            className={`flex items-center justify-center rounded-md border border-dashed border-white/20 text-[10px] opacity-40 ${EMPTY_PLACEHOLDER[size]}`}
            aria-label="Discard pile, empty"
          >
            empty
          </div>
        )}
        <div className="text-[10px] uppercase tracking-widest opacity-50">
          Discard {count > 0 && `· ${count}`}
        </div>
      </div>
    );
  return (
    <>
      {trigger}
      {open && (
        <div
          className="fixed inset-0 z-50 flex flex-col justify-end bg-[var(--color-felt)]/55 backdrop-blur-sm sm:items-center sm:justify-center sm:p-8"
          role="dialog"
          aria-modal="true"
          aria-label="Discard pile"
          onClick={() => setOpen(false)}
        >
          <div
            className="surface-paper max-h-[80vh] w-full overflow-y-auto rounded-t-3xl p-5 sm:max-w-2xl sm:rounded-3xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-display text-xl font-semibold text-[var(--color-ink)]">Discard pile · {count}</h3>
              <button
                onClick={() => setOpen(false)}
                className="rounded-full px-3 py-1 text-sm font-semibold text-[var(--color-ink-soft)] transition hover:bg-[var(--color-tint)] hover:text-[var(--color-ink)]"
              >
                Close
              </button>
            </div>
            {fullPile && fullPile.length > 0 ? (
              <>
                <p className="mb-3 text-xs opacity-60">Most recent first.</p>
                <div className="flex flex-wrap gap-2">
                  {[...fullPile].reverse().map((cid, i) => (
                    <Card key={`${cid}-${i}`} cardId={cid} size="sm" animated={false} />
                  ))}
                </div>
              </>
            ) : topCardId ? (
              <>
                <p className="mb-3 text-xs opacity-60">
                  Showing the top card. Full history coming soon.
                </p>
                <Card cardId={topCardId} size="md" animated={false} />
              </>
            ) : (
              <p className="text-sm opacity-60">No cards in discard yet.</p>
            )}
          </div>
        </div>
      )}
    </>
  );
}
