"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useAnimate } from "motion/react";

import type { ProjectedGameState } from "@/engine/project";

import { isTargetingSelf, lastMustShow } from "./log/logFilters";
import { LogEntryRow } from "./log/LogEntryRow";

// Mobile-only persistent surface that always shows the most recent
// strategically-meaningful action. Lives just under TopBanner inside the
// sticky cockpit so a player who looked away can glance up and read what
// just happened — no taps required, no transient toasts to chase.
//
// Brightens + single-shot pulse on each new must-show entry; auto-fades to
// ~50% opacity after 6s of stillness (12s when the local player was the
// target). Tap anywhere on the ribbon to open the full PlayLogSheet.

const FADE_AFTER_MS = 6000;
const FADE_AFTER_TARGETED_MS = 12000;

export function RecentsRibbon({
  state,
  selfId,
  onOpen,
}: {
  state: ProjectedGameState;
  selfId?: string;
  onOpen: () => void;
}) {
  const entry = lastMustShow(state.log);
  const lastSeenIndexRef = useRef<number>(-1);
  // The index of the entry we're currently showing, to detect "new arrival"
  // for pulse + fade-reset. We use log length as the index since lastMustShow
  // is monotonic in log growth.
  const currentLogLength = state.log.length;

  const [scope, animate] = useAnimate();
  const [opacity, setOpacity] = useState(1);
  const fadeTimerRef = useRef<number | undefined>(undefined);

  const targeted = entry ? isTargetingSelf(entry, selfId) : false;

  useEffect(() => {
    if (!entry) return;
    if (lastSeenIndexRef.current === currentLogLength) return; // no change
    lastSeenIndexRef.current = currentLogLength;

    // Brighten back to full and reset the fade timer.
    setOpacity(1);
    if (fadeTimerRef.current) window.clearTimeout(fadeTimerRef.current);
    fadeTimerRef.current = window.setTimeout(
      () => setOpacity(0.5),
      targeted ? FADE_AFTER_TARGETED_MS : FADE_AFTER_MS,
    );

    // Single-shot pulse on arrival. Brief enough to compose with the slow
    // turn-banner pulse without compounding into visual noise.
    if (scope.current) {
      animate(
        scope.current,
        targeted
          ? { scale: [1, 1.025, 1], boxShadow: ["0 0 0 0 rgba(34,211,238,0)", "0 0 0 4px rgba(34,211,238,0.35)", "0 0 0 0 rgba(34,211,238,0)"] }
          : { scale: [1, 1.015, 1] },
        { duration: 0.4, ease: "easeOut" },
      );
    }
  }, [currentLogLength, entry, targeted, animate, scope]);

  useEffect(() => {
    return () => {
      if (fadeTimerRef.current) window.clearTimeout(fadeTimerRef.current);
    };
  }, []);

  if (!entry) return null;

  return (
    <motion.button
      ref={scope}
      type="button"
      onClick={onOpen}
      animate={{ opacity }}
      transition={{ duration: 0.25 }}
      aria-label="Open play log"
      data-testid="recents-ribbon"
      className={[
        "surface-inked-soft sm:hidden w-full overflow-hidden rounded-xl px-3 py-1.5 text-left transition-colors",
        targeted ? "ring-2 ring-cyan-300/70" : "",
      ].join(" ")}
    >
      <div className="flex items-center gap-1.5">
        <span
          aria-hidden
          className="text-[9px] font-semibold uppercase tracking-widest opacity-60"
        >
          Last
        </span>
        <span className="flex-1 min-w-0 truncate">
          <LogEntryRow entry={entry} state={state} selfId={selfId} variant="ribbon" />
        </span>
        <span aria-hidden className="opacity-60 text-[11px]">
          ▸
        </span>
      </div>
    </motion.button>
  );
}
