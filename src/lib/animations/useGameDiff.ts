// Subscribes to the Zustand game store and fires `onEvent` for each new
// LogEntry appended since the last render. On first call (or after a reset
// like reconnect), seeds the cursor at the current log length so we don't
// replay the entire history as effects.

import { useEffect, useRef } from "react";

import { useGame } from "@/lib/gameStore";
import type { LogEntry } from "@/engine/state";

export function useGameEvents(onEvent: (entry: LogEntry) => void): void {
  const log = useGame((s) => s.state?.log);
  const cursor = useRef<number | null>(null);
  const handler = useRef(onEvent);
  handler.current = onEvent;

  useEffect(() => {
    if (!log) {
      cursor.current = null;
      return;
    }
    if (cursor.current === null) {
      // First time we see this game — skip the historical tail so reconnect
      // / late join doesn't replay the whole game as a fireworks show.
      cursor.current = log.length;
      return;
    }
    if (log.length < cursor.current) {
      // Log shrank (probably a fresh game / state reset). Reseed.
      cursor.current = log.length;
      return;
    }
    for (let i = cursor.current; i < log.length; i++) {
      const entry = log[i];
      if (entry) handler.current(entry);
    }
    cursor.current = log.length;
  }, [log]);
}
