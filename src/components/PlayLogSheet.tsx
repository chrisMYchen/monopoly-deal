"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import type { ProjectedGameState } from "@/engine/project";
import type { LogEntry } from "@/engine/state";

import { isSignal, isTargetingSelf } from "./log/logFilters";
import { LogEntryRow } from "./log/LogEntryRow";
import { TurnTimerPill } from "./TurnTimerPill";

// Selector for focusable elements inside the sheet — used to bootstrap focus
// on open and to wrap focus on Tab/Shift+Tab so screen-reader users can't
// step out into the dimmed game beneath.
const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Mobile bottom sheet showing the full play log with filter chips. Matches
// the OpponentDetailSheet / SelfBankSheet pattern (fixed inset-0, justify-end
// on mobile, justify-center on desktop, dismiss on backdrop tap).
//
// Newest entries at top — this is "what just happened?" not a chat log, so
// reverse-chronological is the right reading order.

type Filter = "all" | "big" | "targeted";

const FILTER_LABELS: Record<Filter, string> = {
  all: "All",
  big: "Big plays",
  targeted: "Targeted me",
};

export function PlayLogSheet({
  state,
  selfId,
  open,
  onClose,
}: {
  state: ProjectedGameState;
  selfId?: string;
  open: boolean;
  onClose: () => void;
}) {
  const [filter, setFilter] = useState<Filter>("all");

  const filtered: LogEntry[] = useMemo(() => {
    const all = state.log;
    let out: LogEntry[];
    switch (filter) {
      case "big":
        out = all.filter(isSignal);
        break;
      case "targeted":
        out = all.filter((e) => isTargetingSelf(e, selfId));
        break;
      default:
        out = all;
    }
    // Newest first — see header comment.
    return [...out].reverse();
  }, [state.log, filter, selfId]);

  // When JSN is targeting the local player, surface the timer in our header
  // so opening the log doesn't bury the countdown (the sticky banner is
  // covered by the sheet at z-40 vs. its z-30).
  const onClockId = onClockPlayerId(state);
  const selfOnClock = onClockId != null && onClockId === selfId;

  // Focus management: on open, capture the previously-focused element and
  // move focus into the sheet. Trap Tab so it wraps around the sheet's
  // focusable elements. Esc closes. On close, restore focus.
  const sheetRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const sheet = sheetRef.current;
    if (!sheet) return;
    const prevFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const focusables = () =>
      Array.from(sheet.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
        (el) => !el.hasAttribute("disabled"),
      );
    focusables()[0]?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const els = focusables();
      if (els.length === 0) return;
      const first = els[0]!;
      const last = els[els.length - 1]!;
      const active = document.activeElement;
      if (e.shiftKey && active === first) {
        last.focus();
        e.preventDefault();
      } else if (!e.shiftKey && active === last) {
        first.focus();
        e.preventDefault();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      // Only restore focus if the prior element is still around.
      if (prevFocus && document.contains(prevFocus)) prevFocus.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-40 flex flex-col justify-end bg-[var(--color-felt)]/75 backdrop-blur-sm sm:items-center sm:justify-center sm:p-8"
      role="dialog"
      aria-modal="true"
      aria-label="Play log"
      onClick={onClose}
      data-testid="play-log-sheet"
    >
      <div
        ref={sheetRef}
        className="surface-inked flex max-h-[85vh] w-full flex-col overflow-hidden rounded-t-2xl shadow-2xl sm:max-w-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2 border-b border-white/10 px-4 py-3">
          <h3 className="flex items-center gap-2 text-base font-semibold">
            <span aria-hidden>📜</span>
            <span>Play log</span>
            <span className="font-mono text-xs opacity-70">{state.log.length}</span>
          </h3>
          <div className="flex items-center gap-2">
            {selfOnClock && (
              <TurnTimerPill
                deadlineMs={state.turnDeadlineMs}
                totalSeconds={state.settings?.turnTimerSeconds ?? null}
                selfOnClock={true}
              />
            )}
            <button
              type="button"
              onClick={onClose}
              className="inline-flex min-h-11 items-center justify-center rounded px-3 py-2 text-sm font-semibold opacity-90 transition hover:bg-white/10 hover:opacity-100"
              aria-label="Close play log"
            >
              Close
            </button>
          </div>
        </div>
        <div
          role="tablist"
          aria-label="Filter play log"
          className="flex gap-1 border-b border-white/10 px-3 py-2"
        >
          {(["all", "big", "targeted"] as Filter[]).map((k) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={filter === k}
              aria-pressed={filter === k}
              onClick={() => setFilter(k)}
              className={[
                "inline-flex min-h-11 items-center rounded-full px-3 py-2 text-[11px] font-semibold uppercase tracking-widest transition",
                filter === k
                  ? "bg-[var(--color-accent)] text-[var(--color-ink-on-dark)]"
                  : "text-white/70 hover:bg-white/10 hover:text-white",
              ].join(" ")}
              data-testid={`play-log-filter-${k}`}
            >
              {FILTER_LABELS[k]}
            </button>
          ))}
        </div>
        <ol
          aria-live="polite"
          aria-relevant="additions"
          className="flex flex-col divide-y divide-white/5 overflow-y-auto px-2 py-1"
        >
          {filtered.length === 0 ? (
            <li className="px-2 py-6 text-center text-xs opacity-70">
              {filter === "targeted"
                ? "No actions targeting you yet."
                : "No log entries yet."}
            </li>
          ) : (
            filtered.map((entry, i) => {
              const targeted = isTargetingSelf(entry, selfId);
              return (
                <li
                  key={`${entry.at}-${i}`}
                  className={[
                    "px-2 py-2",
                    targeted ? "bg-[var(--color-accent)]/12" : "",
                  ].join(" ")}
                >
                  <LogEntryRow
                    entry={entry}
                    state={state}
                    selfId={selfId}
                    variant="sheet"
                  />
                </li>
              );
            })
          )}
        </ol>
      </div>
    </div>
  );
}

// Mirror of the engine helper for the projected state — kept inline to avoid
// pulling engine modules into a UI-only component.
function onClockPlayerId(state: ProjectedGameState): string | null {
  if (state.phase !== "playing") return null;
  const p = state.pending;
  if (p == null) return state.players[state.currentTurn]?.id ?? null;
  switch (p.kind) {
    case "awaitDiscardToLimit":
      return p.playerId;
    case "awaitJustSayNo":
      return p.responderIsActor
        ? p.declaration.sourceId
        : (p.pendingDefenders[0] ?? null);
    case "awaitPayment":
      return p.payerId;
  }
}
