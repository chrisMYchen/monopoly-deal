"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";

import { SET_LABEL, cardById, type CardId, type SetColor } from "@/engine/cards";
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
  /gave .* and took .* from/i, // forced-deal completion (rich toast below)
];

const TOAST_MS = 3500;
const TARGET_TOAST_MS = 6000; // longer for the player who got swapped

type Toast = {
  id: number;
  message: string;
  // Optional structured swap payload — when present we render a rich toast
  // with mini property chips instead of the plain message string.
  swap?: NonNullable<LogEntry["swap"]>;
  // True when the LOCAL player is the swap target — toast is louder + lingers.
  isTarget?: boolean;
};

export function Toasts({ log, selfId }: { log: LogEntry[]; selfId?: string }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const lastSeenLength = useRef(log.length);
  const idCounter = useRef(0);

  useEffect(() => {
    const newOnes = log.slice(lastSeenLength.current);
    lastSeenLength.current = log.length;
    if (newOnes.length === 0) return;
    const additions: Toast[] = newOnes
      .filter((entry) => HIGH_IMPACT_PATTERNS.some((p) => p.test(entry.message)))
      .map((entry) => ({
        id: ++idCounter.current,
        message: entry.message,
        swap: entry.swap,
        isTarget: !!(entry.swap && selfId && entry.swap.targetId === selfId),
      }));
    if (additions.length === 0) return;
    setToasts((cur) => [...cur, ...additions].slice(-4));
    // Auto-dismiss each new toast after TOAST_MS (or longer when it targets us).
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
              "pointer-events-auto rounded-md border px-3 py-1.5 text-center text-sm shadow-xl backdrop-blur",
              t.isTarget
                ? "border-cyan-300/60 bg-cyan-500/15 text-cyan-50 shadow-cyan-500/20"
                : "border-white/20 bg-zinc-900/95",
            ].join(" ")}
          >
            {t.swap ? <SwapToast toast={t} /> : t.message}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

// Rich Forced-Deal toast: shows both swapped property labels with color chips
// and reframes the message from the LOCAL player's perspective when they were
// the target ("Bob took your Boardwalk and gave you Connecticut").
function SwapToast({ toast }: { toast: Toast }) {
  const swap = toast.swap!;
  // Reuse the engine's canonical message to extract names without hard-coding.
  const m = toast.message.match(/^(.*?) gave .* and took .* from (.*?)\.$/);
  const sourceName = m?.[1] ?? "";
  const targetName = m?.[2] ?? "";
  if (toast.isTarget) {
    // Local player POV — emphasize what they LOST and what they GAINED.
    return (
      <div className="flex flex-col items-center gap-1">
        <div className="text-xs uppercase tracking-widest opacity-70">
          {sourceName} forced a swap
        </div>
        <div className="flex flex-wrap items-center justify-center gap-1.5 text-[13px]">
          <span className="opacity-70">You lost</span>
          <ToastChip cardId={swap.tookCardId} color={swap.tookFromColor} />
          <span aria-hidden className="opacity-50">→</span>
          <span className="opacity-70">got</span>
          <ToastChip cardId={swap.gaveCardId} color={swap.gaveFromColor} />
        </div>
      </div>
    );
  }
  // Spectator / source POV — neutral phrasing.
  return (
    <div className="flex flex-wrap items-center justify-center gap-1.5">
      <span className="font-semibold">{sourceName}</span>
      <span className="opacity-70">↔</span>
      <span className="font-semibold">{targetName}</span>
      <ToastChip cardId={swap.gaveCardId} color={swap.gaveFromColor} />
      <span aria-hidden className="opacity-50">↔</span>
      <ToastChip cardId={swap.tookCardId} color={swap.tookFromColor} />
    </div>
  );
}

const TOAST_CHIP_BG: Record<SetColor, string> = {
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

function ToastChip({ cardId, color }: { cardId: CardId; color: SetColor }) {
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
      className={`inline-flex items-center rounded-sm px-1.5 py-[1px] text-[12px] font-semibold ${TOAST_CHIP_BG[color]}`}
      title={`${name} — ${SET_LABEL[color]}`}
    >
      {name}
    </span>
  );
}
