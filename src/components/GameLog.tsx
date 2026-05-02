"use client";

import { useEffect, useRef, useState } from "react";

import type { LogEntry } from "@/engine/state";

// Collapsible log panel showing the last N moves. Auto-scrolls to the bottom on
// new entries so players never have to manually scroll to "what just happened?"
// Critical for online trust + beginner learning.

const MAX_VISIBLE = 200;

export function GameLog({ log }: { log: LogEntry[] }) {
  const [open, setOpen] = useState(false);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const lastEntry = log.length > 0 ? log[log.length - 1] : null;

  // Auto-scroll to bottom when a new entry arrives and panel is open.
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [log.length, open]);

  // Visible slice — most recent first when collapsed, chronological when open.
  const trimmed = log.slice(-MAX_VISIBLE);

  return (
    <div
      className={[
        "fixed z-20 flex flex-col rounded-md border border-white/15 bg-zinc-900/85 text-xs shadow-xl backdrop-blur",
        // Mobile: compact, top-right corner, narrow when collapsed.
        // Desktop: wider, max 60vh, doesn't compete with the banner.
        "right-2 top-2 max-h-[60vh]",
        open ? "w-[88vw] max-w-sm sm:w-72" : "w-auto sm:w-72",
      ].join(" ")}
      data-testid="game-log"
    >
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 hover:bg-white/5"
        aria-expanded={open}
        aria-label={open ? "Collapse game log" : "Expand game log"}
      >
        <span className="font-semibold uppercase tracking-widest opacity-70">
          Log {log.length > 0 && `· ${log.length}`}
        </span>
        <span className="opacity-50">{open ? "▾" : "◂"}</span>
      </button>
      {open ? (
        <div
          ref={scrollerRef}
          className="overflow-y-auto px-2 pb-2"
          aria-live="polite"
        >
          <ol className="flex flex-col gap-0.5">
            {trimmed.map((entry, i) => (
              <li
                key={`${entry.at}-${i}`}
                className="rounded border-l-2 border-white/10 pl-2 leading-snug opacity-80"
              >
                {entry.message}
              </li>
            ))}
          </ol>
        </div>
      ) : null}
      {/* Latest entry visible at-a-glance ONLY on desktop when collapsed —
          mobile defers to a small badge to keep the viewport breathing. */}
      {!open && lastEntry && (
        <div className="hidden border-t border-white/10 px-2 py-1.5 leading-snug opacity-80 sm:block">
          {lastEntry.message}
        </div>
      )}
    </div>
  );
}
