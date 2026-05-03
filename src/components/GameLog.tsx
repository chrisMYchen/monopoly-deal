"use client";

import { useEffect, useRef, useState } from "react";

import { SET_LABEL, cardById, type CardId, type SetColor } from "@/engine/cards";
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
        "surface-paper fixed z-20 flex flex-col overflow-hidden rounded-2xl text-xs",
        "right-2 top-2 max-h-[60vh]",
        open ? "w-[88vw] max-w-sm sm:w-72" : "w-auto sm:w-72",
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
                {entry.swap ? <SwapEntry entry={entry} /> : entry.message}
              </li>
            ))}
          </ol>
        </div>
      ) : null}
      {/* Latest entry visible at-a-glance ONLY on desktop when collapsed —
          mobile defers to a small badge to keep the viewport breathing. */}
      {!open && lastEntry && (
        <div className="hidden border-t border-[var(--color-ink)]/10 px-3 py-1.5 leading-snug text-[var(--color-ink-soft)] sm:block">
          {lastEntry.swap ? <SwapEntry entry={lastEntry} /> : lastEntry.message}
        </div>
      )}
    </div>
  );
}

// Rich rendering for a Forced Deal swap log entry: parses the message text
// around the two property labels and inlines color chips so readers can see
// at-a-glance which colors changed hands.
function SwapEntry({ entry }: { entry: LogEntry }) {
  if (!entry.swap) return <>{entry.message}</>;
  const { gaveCardId, tookCardId, gaveFromColor, tookFromColor } = entry.swap;
  // Source/target names are reliably the first/last words of the canonical
  // message: "<source> gave <X> and took <Y> from <target>." We just split.
  const m = entry.message.match(/^(.*?) gave .* and took .* from (.*?)\.$/);
  const sourceName = m?.[1] ?? "";
  const targetName = m?.[2] ?? "";
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <span className="font-semibold">{sourceName}</span>
      <span className="opacity-60">gave</span>
      <CardChip cardId={gaveCardId} color={gaveFromColor} />
      <span aria-hidden className="opacity-50">↔</span>
      <span className="opacity-60">took</span>
      <CardChip cardId={tookCardId} color={tookFromColor} />
      <span className="opacity-60">from</span>
      <span className="font-semibold">{targetName}</span>
    </span>
  );
}

const CHIP_BG: Record<SetColor, string> = {
  brown: "bg-[var(--color-set-brown)] text-white",
  lightBlue: "bg-[var(--color-set-light-blue)] text-zinc-900",
  pink: "bg-[var(--color-set-pink)] text-white",
  orange: "bg-[var(--color-set-orange)] text-white",
  red: "bg-[var(--color-set-red)] text-white",
  yellow: "bg-[var(--color-set-yellow)] text-zinc-900",
  green: "bg-[var(--color-set-green)] text-white",
  darkBlue: "bg-[var(--color-set-dark-blue)] text-white",
  railroad: "bg-[var(--color-set-railroad)] text-white",
  utility: "bg-[var(--color-set-utility)] text-zinc-900",
};

function CardChip({ cardId, color }: { cardId: CardId; color: SetColor }) {
  const c = cardById(cardId);
  const name =
    c.kind === "property"
      ? c.name
      : c.kind === "wild2"
        ? "Wild"
        : c.kind === "wild10"
          ? "★ Wild"
          : "card";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-sm px-1 py-[1px] text-[10px] font-medium ${CHIP_BG[color]}`}
      title={`${name} — ${SET_LABEL[color]}`}
    >
      {name}
    </span>
  );
}
