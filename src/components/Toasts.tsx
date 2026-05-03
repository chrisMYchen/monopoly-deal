"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";

import type { ProjectedGameState } from "@/engine/project";
import type { LogEntry } from "@/engine/state";

import { isSignal, isTargetingSelf } from "./log/logFilters";
import { LogEntryRow } from "./log/LogEntryRow";

// Surfaces high-impact game events as transient toasts at the top-center of
// the viewport. Filtered from the engine log so we don't spam every "drew 2"
// message — only events with real strategic weight (action card plays, JSN,
// payments, win) get a toast.
//
// Beginner: never miss "Bob played Deal Breaker on you." Expert: keep
// peripheral awareness of opponents while planning your own turn.
//
// Filter + targeting logic is shared with RecentsRibbon and PlayLogSheet via
// `logFilters` so the three surfaces stay consistent.

const TOAST_MS = 3500;
const TARGET_TOAST_MS = 6000; // longer when the local player is targeted

type Toast = {
  id: number;
  entry: LogEntry;
  isTarget: boolean;
};

export function Toasts({ state, selfId }: { state: ProjectedGameState; selfId?: string }) {
  const log = state.log;
  const [toasts, setToasts] = useState<Toast[]>([]);
  const lastSeenLength = useRef(log.length);
  const idCounter = useRef(0);

  useEffect(() => {
    const newOnes = log.slice(lastSeenLength.current);
    lastSeenLength.current = log.length;
    if (newOnes.length === 0) return;
    const additions: Toast[] = newOnes
      .filter((entry) => isSignal(entry))
      .map((entry) => ({
        id: ++idCounter.current,
        entry,
        isTarget: isTargetingSelf(entry, selfId),
      }));
    if (additions.length === 0) return;
    setToasts((cur) => [...cur, ...additions].slice(-4));
    additions.forEach((t) => {
      const ttl = t.isTarget ? TARGET_TOAST_MS : TOAST_MS;
      setTimeout(() => {
        setToasts((cur) => cur.filter((c) => c.id !== t.id));
      }, ttl);
    });
  }, [log, selfId]);

  return (
    <div
      className="pointer-events-none fixed left-1/2 top-16 z-30 flex w-[min(440px,92vw)] -translate-x-1/2 flex-col items-center gap-1.5"
      role="status"
      aria-live="polite"
    >
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, y: -8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.96 }}
            transition={{ duration: 0.18 }}
            className={[
              "pointer-events-auto rounded-full px-4 py-1.5 text-center text-sm shadow-[0_8px_24px_-8px_rgba(15,42,46,0.4)] backdrop-blur",
              t.isTarget
                ? "bg-[var(--color-gold)] text-[var(--color-inked)] ring-2 ring-[var(--color-gold-deep)]/60"
                : "surface-inked",
            ].join(" ")}
          >
            <div className="flex items-center justify-center">
              <LogEntryRow
                entry={t.entry}
                state={state}
                selfId={selfId}
                variant="dialog"
              />
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
