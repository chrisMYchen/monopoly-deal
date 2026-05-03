"use client";

// Short-lived floating text overlay. Used for "+$5M", "MONOPOLY!", "STEAL!",
// "BLOCKED!", "TURN END". Anchored at a screen point (px coords). Pure
// decoration — pointer-events:none, no interaction. Honors reduced-motion.

import { motion } from "motion/react";

export type BigNumberTone = "good" | "bad" | "neutral" | "celebration";

const TONE_CLASSES: Record<BigNumberTone, string> = {
  good: "text-emerald-300 drop-shadow-[0_0_18px_rgba(52,211,153,0.7)]",
  bad: "text-rose-400 drop-shadow-[0_0_18px_rgba(251,113,133,0.7)]",
  neutral: "text-zinc-100 drop-shadow-[0_0_14px_rgba(228,228,231,0.6)]",
  celebration:
    "text-yellow-300 drop-shadow-[0_0_22px_rgba(250,204,21,0.85)]",
};

export type BigNumberProps = {
  text: string;
  // Center coordinates in viewport px. The component absolutely positions
  // itself relative to its overlay container (which should fill the viewport).
  x: number;
  y: number;
  tone?: BigNumberTone;
  // Pixel radius for the float distance.
  rise?: number;
  // Display scale relative to default ~24px font size.
  scale?: number;
};

export function BigNumber({
  text,
  x,
  y,
  tone = "neutral",
  rise = 48,
  scale = 1,
}: BigNumberProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 0, scale: 0.6 * scale }}
      animate={{
        opacity: [0, 1, 1, 0],
        y: [0, -rise * 0.4, -rise * 0.8, -rise],
        scale: [0.6 * scale, 1.25 * scale, 1.0 * scale, 0.95 * scale],
      }}
      transition={{
        duration: 0.95,
        ease: [0.16, 1, 0.3, 1],
        times: [0, 0.25, 0.6, 1],
      }}
      style={{ left: x, top: y, transform: "translate(-50%, -50%)" }}
      className={`pointer-events-none absolute select-none whitespace-nowrap text-2xl font-extrabold uppercase tracking-wider ${TONE_CLASSES[tone]}`}
    >
      {text}
    </motion.div>
  );
}
