"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";

import type { LogEntry } from "@/engine/state";

// Surfaces high-impact game events as transient toasts at the top-center of
// the viewport. Filtered from the engine log so we don't spam every "drew 2"
// message — only events with real strategic weight (action card plays, JSN,
// payments, win) get a toast.
//
// Beginner: never miss "Bob played Deal Breaker on you." Expert: keep
// peripheral awareness of opponents while planning your own turn.

const HIGH_IMPACT_PATTERNS = [
  /plays Sly Deal/i,
  /plays Forced Deal/i,
  /plays Deal Breaker/i,
  /plays Debt Collector/i,
  /plays It's My Birthday/i,
  /plays Rent/i,
  /plays Just Say No/i,
  /Action against/i, // canceled
  /stole .* set/i,
  /detached/i,
  /wins with/i,
];

const TOAST_MS = 3500;

type Toast = { id: number; message: string };

export function Toasts({ log }: { log: LogEntry[] }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const lastSeenLength = useRef(log.length);
  const idCounter = useRef(0);

  useEffect(() => {
    const newOnes = log.slice(lastSeenLength.current);
    lastSeenLength.current = log.length;
    if (newOnes.length === 0) return;
    const additions: Toast[] = newOnes
      .filter((entry) => HIGH_IMPACT_PATTERNS.some((p) => p.test(entry.message)))
      .map((entry) => ({ id: ++idCounter.current, message: entry.message }));
    if (additions.length === 0) return;
    setToasts((cur) => [...cur, ...additions].slice(-4));
    // Auto-dismiss each new toast after TOAST_MS.
    additions.forEach((t) => {
      setTimeout(() => {
        setToasts((cur) => cur.filter((c) => c.id !== t.id));
      }, TOAST_MS);
    });
  }, [log]);

  return (
    <div
      className="pointer-events-none fixed left-1/2 top-16 z-30 flex w-[min(420px,90vw)] -translate-x-1/2 flex-col items-center gap-1.5"
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
            className="pointer-events-auto rounded-md border border-white/20 bg-zinc-900/95 px-3 py-1.5 text-center text-sm shadow-xl backdrop-blur"
          >
            {t.message}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
