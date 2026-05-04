"use client";

// Top-center rent-demand banner. Slides in from above, sits for ~3.5s,
// slides out. Pure decoration — pointer-events:none. Does not gate any
// input or modal; the actual payment dialog is separate.

import { motion } from "motion/react";

export type RentDemandProps = {
  amount: number;
  color?: string;
  fromName: string;
  multiplier?: number;
};

// Property color chips reuse the canon set color tokens — no duplicate
// colorways. The rent demand banner itself is solid Monopoly red so the
// "you owe money" cue is impossible to miss but still NYT-clean (no glow,
// no gold, no blur shadows).
const COLOR_CHIP: Record<string, string> = {
  brown: "bg-[var(--color-set-brown)]",
  lightBlue: "bg-[var(--color-set-light-blue)]",
  pink: "bg-[var(--color-set-pink)]",
  orange: "bg-[var(--color-set-orange)]",
  red: "bg-[var(--color-set-red)]",
  yellow: "bg-[var(--color-set-yellow)]",
  green: "bg-[var(--color-set-green)]",
  darkBlue: "bg-[var(--color-set-dark-blue)]",
  railroad: "bg-[var(--color-set-railroad)]",
  utility: "bg-[var(--color-set-utility)]",
};

export function RentDemand({ amount, color, fromName, multiplier }: RentDemandProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -40, scale: 0.92 }}
      animate={{
        opacity: [0, 1, 1, 0],
        y: [-40, 0, 0, -20],
        scale: [0.92, 1, 1, 0.95],
      }}
      transition={{
        duration: 3.4,
        ease: [0.16, 1, 0.3, 1],
        times: [0, 0.06, 0.85, 1],
      }}
      className="pointer-events-none fixed left-1/2 top-16 z-[60] -translate-x-1/2"
    >
      <div className="flex items-center gap-3 rounded-full bg-[var(--color-accent)] px-5 py-2.5 text-[var(--color-ink-on-dark)]">
        {color && (
          <span
            className={`inline-block h-3 w-3 rounded-full ring-2 ring-white/60 ${COLOR_CHIP[color] ?? "bg-white"}`}
            aria-hidden
          />
        )}
        <div className="flex items-baseline gap-2">
          <span className="tabular font-display text-2xl font-bold">
            ${amount}M
          </span>
          {multiplier && multiplier > 1 ? (
            <span className="tabular text-sm font-bold opacity-85">×{multiplier}</span>
          ) : null}
          <span className="text-xs font-bold uppercase tracking-[0.18em]">RENT</span>
        </div>
        <span className="text-xs font-semibold uppercase tracking-[0.16em] opacity-90">
          to {fromName}
        </span>
      </div>
    </motion.div>
  );
}
