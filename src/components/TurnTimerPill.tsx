"use client";

import { useEffect, useState } from "react";

// Visual countdown to the server-supplied deadline. Server is authoritative;
// this is purely for player awareness. Hidden when no deadline is set.
export function TurnTimerPill({
  deadlineMs,
  totalSeconds,
}: {
  deadlineMs: number | undefined;
  totalSeconds: number | null;
}) {
  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => {
    if (deadlineMs == null) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [deadlineMs]);

  if (deadlineMs == null || totalSeconds == null) return null;

  const remainingMs = Math.max(0, deadlineMs - now);
  const remainingSec = Math.ceil(remainingMs / 1000);

  let tone = "border-white/15 bg-white/10";
  let dotTone = "bg-white/70";
  if (remainingSec <= 3) {
    tone = "border-red-400/60 bg-red-500/15 text-red-200 rr-pulse";
    dotTone = "bg-red-400";
  } else if (remainingSec <= 10) {
    tone = "border-amber-400/60 bg-amber-500/15 text-amber-200";
    dotTone = "bg-amber-400";
  }

  return (
    <span
      className={[
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-mono tabular-nums",
        tone,
      ].join(" ")}
      data-testid="turn-timer-pill"
      data-remaining-sec={remainingSec}
      role="timer"
      aria-label={`${remainingSec} seconds remaining`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${dotTone}`} aria-hidden />
      {remainingSec}s
    </span>
  );
}
