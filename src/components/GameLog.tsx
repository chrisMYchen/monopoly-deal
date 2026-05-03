"use client";

import { useEffect, useRef, useState } from "react";

import type { ProjectedGameState } from "@/engine/project";

import { LogEntryRow } from "./log/LogEntryRow";

// Collapsible log panel showing the last N moves. Auto-scrolls to the bottom on
// new entries so players never have to manually scroll to "what just happened?"
// Critical for online trust + beginner learning.
//
// Mobile uses RecentsRibbon + PlayLogSheet for the same job; this component is
// hidden on small viewports (see outer `hidden flex sm:flex` below) and
// remains the desktop home for the play log.

const MAX_VISIBLE = 200;

export function GameLog({ state }: { state: ProjectedGameState }) {
  const [open, setOpen] = useState(false);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const log = state.log;
  const lastEntry = log.length > 0 ? log[log.length - 1] : null;

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [log.length, open]);

  const trimmed = log.slice(-MAX_VISIBLE);

  return (
    <div
      className={[
        "surface-paper fixed z-20 hidden flex-col overflow-hidden rounded-2xl text-xs sm:flex",
        "right-2 top-2 max-h-[60vh] w-72",
      ].join(" ")}
      data-testid="game-log"
    >
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center justify-between gap-2 px-3 py-1.5 transition hover:bg-[var(--color-bg-tint)]"
        aria-expanded={open}
        aria-label={open ? "Collapse game log" : "Expand game log"}
      >
        <span className="font-semibold uppercase tracking-[0.16em] text-[var(--color-ink-soft)]">
          Log {log.length > 0 && `· ${log.length}`}
        </span>
        <span className="text-[var(--color-ink-faint)]">{open ? "▾" : "◂"}</span>
      </button>
      {open ? (
        <div
          ref={scrollerRef}
          className="overflow-y-auto px-3 pb-2"
          aria-live="polite"
        >
          <ol className="flex flex-col gap-0.5">
            {trimmed.map((entry, i) => (
              <li
                key={`${entry.at}-${i}`}
                className="border-l-2 border-[var(--color-ink)]/12 pl-2 leading-snug text-[var(--color-ink-soft)]"
              >
                <LogEntryRow
                  entry={entry}
                  state={state}
                  selfId={state.selfId}
                  variant="sheet"
                />
              </li>
            ))}
          </ol>
        </div>
      ) : null}
      {!open && lastEntry && (
        <div className="border-t border-[var(--color-ink)]/10 px-3 py-1.5 leading-snug text-[var(--color-ink-soft)]">
          <LogEntryRow
            entry={lastEntry}
            state={state}
            selfId={state.selfId}
            variant="sheet"
          />
        </div>
      )}
    </div>
  );
}
