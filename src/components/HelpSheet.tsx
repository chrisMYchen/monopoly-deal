"use client";

import { useState } from "react";

// Tiny "?" button at the corner of the screen → bottom-sheet with a rules
// summary. Always reachable so beginners can re-check rules mid-game without
// leaving the room.

export function HelpButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open rules summary"
        title="Rules summary"
        className="surface-inked btn-sticker fixed bottom-20 right-2 z-20 flex h-10 w-10 items-center justify-center rounded-full text-lg font-bold"
        data-testid="help-button"
      >
        ?
      </button>
      {open && (
        <div
          className="fixed inset-0 z-50 flex flex-col justify-end bg-[var(--color-inked)]/55 backdrop-blur-sm sm:items-center sm:justify-center sm:p-8"
          role="dialog"
          aria-modal="true"
          aria-label="Rules summary"
          onClick={() => setOpen(false)}
        >
          <div
            className="surface-paper max-h-[80vh] w-full overflow-y-auto rounded-t-3xl p-5 sm:max-w-lg sm:rounded-3xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-display text-xl font-semibold text-[var(--color-ink)]">
                How to play
              </h3>
              <button
                onClick={() => setOpen(false)}
                className="rounded-full px-3 py-1 text-sm font-semibold text-[var(--color-ink-soft)] transition hover:bg-[var(--color-bg-tint)] hover:text-[var(--color-ink)]"
              >
                Close
              </button>
            </div>
            <div className="space-y-3 text-sm leading-relaxed">
              <p>
                <strong>Goal:</strong> first to 3 complete property sets in 3 different colors wins.
              </p>
              <p>
                <strong>Each turn:</strong> draw 2 cards (5 if hand is empty) → play up to 3 cards
                → end your turn. Hand limit is 7 cards at end of turn.
              </p>
              <p>
                <strong>Each card</strong> can be played as a property (laid down in front of you), as money
                (banked sideways), or for its action effect. Wilds must join an existing same-color
                group; rainbow wilds need at least one solid card with them.
              </p>
              <details>
                <summary className="cursor-pointer font-semibold">Action cards</summary>
                <ul className="mt-2 ml-4 list-disc space-y-1 text-xs">
                  <li><strong>Sly Deal</strong>: steal one property (not in a complete set).</li>
                  <li><strong>Forced Deal</strong>: trade one of your properties for one of theirs.</li>
                  <li><strong>Deal Breaker</strong>: steal a complete set.</li>
                  <li><strong>Debt Collector</strong>: force one opponent to pay $5M.</li>
                  <li><strong>It's My Birthday</strong>: every opponent owes you $2M.</li>
                  <li><strong>Rent</strong>: charge rent on your color. ★ wild charges one opponent.</li>
                  <li><strong>Double The Rent</strong>: must be played with a Rent card. Counts as 2 plays.</li>
                  <li><strong>House / Hotel</strong>: +$3M / +$4M to a complete set's rent.</li>
                  <li><strong>Pass Go</strong>: draw 2 extra cards.</li>
                  <li><strong>Just Say No</strong>: cancel any action targeting you.</li>
                </ul>
              </details>
              <details>
                <summary className="cursor-pointer font-semibold">Tips</summary>
                <ul className="mt-2 ml-4 list-disc space-y-1 text-xs">
                  <li>Long-press any card to peek at its full description.</li>
                  <li>Tap an opponent to see their full properties and bank.</li>
                  <li>The dot meter next to each name shows how close they are to winning (X/3).</li>
                  <li>The pulsing yellow border on the top banner means it's your turn.</li>
                  <li>"No change given" — paying $5 against a $2 debt loses the difference.</li>
                </ul>
              </details>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
