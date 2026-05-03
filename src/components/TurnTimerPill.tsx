"use client";

import { useEffect, useState } from "react";

// Visual countdown to the server-supplied deadline. Server is authoritative;
// this is purely for player awareness. Hidden when no deadline is set.
//
// Affordance ramps up as time runs out:
//   >10s : neutral pill
//   ≤10s : amber pill, scales up, breathing pulse, shrinking SVG ring
//   ≤3s  : red pill, faster pulse, ring nearly empty
//
// When `selfOnClock` and time is critical, also renders a fixed full-viewport
// vignette via <ScreenEdgePulse /> — peripheral vision attention without
// blocking any input (pointer-events: none).
export function TurnTimerPill({
  deadlineMs,
  totalSeconds,
  selfOnClock,
}: {
  deadlineMs: number | undefined;
  totalSeconds: number | null;
  selfOnClock?: boolean;
}) {
  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => {
    if (deadlineMs == null) return;
    const id = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(id);
  }, [deadlineMs]);

  if (deadlineMs == null || totalSeconds == null) return null;

  const remainingMs = Math.max(0, deadlineMs - now);
  const remainingSec = Math.ceil(remainingMs / 1000);
  const fraction = Math.min(1, Math.max(0, remainingMs / (totalSeconds * 1000)));

  const tier: "normal" | "warn" | "crit" =
    remainingSec <= 3 ? "crit" : remainingSec <= 10 ? "warn" : "normal";

  const palette = {
    normal: {
      pill: "border-white/15 bg-white/10 text-white/90",
      ring: "stroke-white/70",
      track: "stroke-white/15",
    },
    warn: {
      pill:
        "border-amber-400/60 bg-amber-500/15 text-amber-100 shadow-[0_0_12px_rgba(251,191,36,0.35)]",
      ring: "stroke-amber-300",
      track: "stroke-amber-300/20",
    },
    crit: {
      pill:
        "border-red-400/70 bg-red-500/20 text-red-100 shadow-[0_0_18px_rgba(248,113,113,0.55)] rr-pulse",
      ring: "stroke-red-300",
      track: "stroke-red-300/20",
    },
  }[tier];

  const sizeClass = tier === "normal" ? "h-6 text-xs" : "h-7 text-sm";
  const ringSize = tier === "normal" ? 12 : 14;
  const ringRadius = ringSize / 2 - 2;
  const ringCircumference = 2 * Math.PI * ringRadius;

  return (
    <>
      <span
        className={[
          "inline-flex items-center gap-1.5 rounded-full border px-2 font-mono tabular-nums transition-all duration-200",
          sizeClass,
          palette.pill,
        ].join(" ")}
        data-testid="turn-timer-pill"
        data-remaining-sec={remainingSec}
        data-tier={tier}
        role="timer"
        aria-label={`${remainingSec} seconds remaining`}
      >
        <svg
          width={ringSize}
          height={ringSize}
          viewBox={`0 0 ${ringSize} ${ringSize}`}
          aria-hidden
          className="-ml-0.5"
        >
          <circle
            cx={ringSize / 2}
            cy={ringSize / 2}
            r={ringRadius}
            fill="none"
            strokeWidth={2}
            className={palette.track}
          />
          <circle
            cx={ringSize / 2}
            cy={ringSize / 2}
            r={ringRadius}
            fill="none"
            strokeWidth={2}
            strokeLinecap="round"
            strokeDasharray={ringCircumference}
            strokeDashoffset={ringCircumference * (1 - fraction)}
            className={palette.ring}
            transform={`rotate(-90 ${ringSize / 2} ${ringSize / 2})`}
            style={{ transition: "stroke-dashoffset 200ms linear" }}
          />
        </svg>
        {remainingSec}s
      </span>

      {selfOnClock && tier === "crit" && <ScreenEdgePulse />}
    </>
  );
}

// Soft red ring around the viewport edge. Pure decoration: pointer-events:none
// so it can never block clicks. Used as a peripheral-vision nudge when time is
// almost out and the on-clock player is the viewer.
function ScreenEdgePulse() {
  return (
    <div
      aria-hidden
      data-testid="turn-timer-edge-pulse"
      className="pointer-events-none fixed inset-0 z-[60] rr-edge-pulse"
      style={{
        boxShadow: "inset 0 0 80px 4px rgba(248,113,113,0.55)",
      }}
    />
  );
}
