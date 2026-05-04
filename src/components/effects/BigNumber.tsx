"use client";

// Short-lived floating text overlay. Used for "+$5M", "MONOPOLY!", "STEAL!",
// "BLOCKED!", "TURN END". Anchored at a screen point (px coords). Pure
// decoration — pointer-events:none, no interaction. Honors reduced-motion.

import { motion } from "motion/react";

export type BigNumberTone = "good" | "bad" | "neutral" | "celebration";

// BigNumber floats are short-lived overlays. The brand discipline is to keep
// the celebration palette inside the editorial system: ink for neutral, the
// canonical red for celebration moments, success-green for gains, accent-red
// for losses. No glowy yellow-on-everything — confetti carries the festivity.
const TONE_CLASSES: Record<BigNumberTone, string> = {
  good: "text-[var(--color-success)] drop-shadow-[0_2px_8px_rgba(31,122,77,0.45)]",
  bad: "text-[var(--color-accent)] drop-shadow-[0_2px_8px_rgba(217,36,42,0.45)]",
  neutral: "text-[var(--color-ink)] drop-shadow-[0_2px_8px_rgba(17,17,17,0.35)]",
  celebration:
    "text-[var(--color-accent)] drop-shadow-[0_2px_12px_rgba(217,36,42,0.55)]",
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
