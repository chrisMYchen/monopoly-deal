"use client";

// Just Say No clash overlay. Centered shield with radial impact lines.
// Pure decoration — pointer-events:none.

import { motion } from "motion/react";

export type ShieldClashProps = {
  // Center px in viewport. Defaults to viewport center.
  x?: number;
  y?: number;
  // "block" tone (defender wins) — yellow.
  // "fail" tone (action canceled by opponent's JSN) — red.
  tone?: "block" | "fail";
};

export function ShieldClash({ x, y, tone = "block" }: ShieldClashProps) {
  const fill = tone === "block" ? "#facc15" : "#f43f5e";
  const stroke = tone === "block" ? "#fde68a" : "#fda4af";
  const cx = x ?? (typeof window !== "undefined" ? window.innerWidth / 2 : 0);
  const cy = y ?? (typeof window !== "undefined" ? window.innerHeight / 2 : 0);
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.4, rotate: -10 }}
      animate={{
        opacity: [0, 1, 1, 0],
        scale: [0.4, 1.18, 1.0, 0.9],
        rotate: [-10, 4, 0, 0],
      }}
      transition={{ duration: 0.55, ease: [0.18, 0.9, 0.3, 1.2], times: [0, 0.3, 0.7, 1] }}
      style={{ left: cx, top: cy, transform: "translate(-50%, -50%)" }}
      className="pointer-events-none absolute"
    >
      <svg width="140" height="140" viewBox="0 0 140 140" fill="none">
        {Array.from({ length: 12 }).map((_, i) => {
          const angle = (i * Math.PI * 2) / 12;
          const x1 = 70 + Math.cos(angle) * 56;
          const y1 = 70 + Math.sin(angle) * 56;
          const x2 = 70 + Math.cos(angle) * 68;
          const y2 = 70 + Math.sin(angle) * 68;
          return (
            <line
              key={i}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke={stroke}
              strokeWidth="3"
              strokeLinecap="round"
              opacity="0.85"
            />
          );
        })}
        <path
          d="M70 18 L110 36 L110 76 C110 96 92 116 70 124 C48 116 30 96 30 76 L30 36 Z"
          fill={fill}
          stroke={stroke}
          strokeWidth="3"
        />
        <path
          d="M52 70 L66 84 L92 56"
          stroke="#0f172a"
          strokeWidth="6"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </svg>
    </motion.div>
  );
}
