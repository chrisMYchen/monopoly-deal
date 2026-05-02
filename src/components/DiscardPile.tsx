"use client";

import { useState } from "react";

import { Card } from "./Card";
import type { CardId } from "@/engine/cards";

// Center discard pile that expands to show every card discarded so far.
// Experts use this to count what's been spent (e.g., how many JSNs left in
// the deck). Beginners see what was just played.

export function DiscardPile({
  topCardId,
  count,
  // The full discard pile, oldest → newest. Server can send this as part of
  // the projected state; right now we only have top + count, so the expanded
  // view shows just the top card with a placeholder note. Future enhancement:
  // surface the full pile in projected state when needed.
  fullPile,
}: {
  topCardId: CardId | null;
  count: number;
  fullPile?: CardId[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => count > 0 && setOpen(true)}
        disabled={count === 0}
        className="flex flex-col items-center gap-1 disabled:cursor-default"
        aria-label={count > 0 ? `Discard pile, ${count} cards` : "Discard pile, empty"}
      >
        {topCardId ? (
          <Card cardId={topCardId} size="md" animated={false} />
        ) : (
          <div className="flex h-[140px] w-[100px] items-center justify-center rounded-md border border-dashed border-white/20 text-xs opacity-40">
            empty
          </div>
        )}
        <div className="text-[10px] uppercase tracking-widest opacity-50">
          Discard {count > 0 && `· ${count}`}
        </div>
      </button>
      {open && (
        <div
          className="fixed inset-0 z-50 flex flex-col justify-end bg-black/60 sm:items-center sm:justify-center sm:p-8"
          role="dialog"
          aria-modal="true"
          aria-label="Discard pile"
          onClick={() => setOpen(false)}
        >
          <div
            className="max-h-[80vh] w-full overflow-y-auto rounded-t-xl border border-white/15 bg-zinc-900 p-4 shadow-2xl sm:max-w-2xl sm:rounded-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-lg font-semibold">Discard pile · {count}</h3>
              <button
                onClick={() => setOpen(false)}
                className="rounded px-2 py-1 text-sm opacity-70 hover:bg-white/10 hover:opacity-100"
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
