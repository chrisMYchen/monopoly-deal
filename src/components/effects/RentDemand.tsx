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

const COLOR_CHIP: Record<string, string> = {
  brown: "bg-amber-700",
  lightBlue: "bg-sky-300",
  pink: "bg-pink-400",
  orange: "bg-orange-400",
  red: "bg-red-500",
  yellow: "bg-yellow-300",
  green: "bg-emerald-500",
  darkBlue: "bg-blue-700",
  railroad: "bg-zinc-700",
  utility: "bg-lime-400",
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
      <div className="flex items-center gap-3 rounded-full bg-zinc-900/90 px-5 py-2.5 ring-2 ring-yellow-300/70 shadow-[0_8px_40px_rgba(250,204,21,0.4)] backdrop-blur">
        {color && (
          <span
            className={`inline-block h-3 w-3 rounded-full ${COLOR_CHIP[color] ?? "bg-zinc-400"}`}
            aria-hidden
          />
        )}
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-extrabold text-yellow-300 drop-shadow-[0_0_10px_rgba(250,204,21,0.7)]">
            ${amount}M
          </span>
          {multiplier && multiplier > 1 ? (
            <span className="text-sm font-bold text-yellow-200/90">×{multiplier}</span>
          ) : null}
          <span className="text-sm uppercase tracking-wider text-yellow-100/90">RENT</span>
        </div>
        <span className="text-xs uppercase tracking-wider text-zinc-300">
          to {fromName}
        </span>
      </div>
    </motion.div>
  );
}
