// Single source of truth for "what counts as noise vs. signal vs. must-show"
// across the three surfaces that read the engine log: Toasts (alarm), the
// mobile RecentsRibbon (persistent receipt), and the PlayLogSheet (archive).
// Previously the Toasts component owned a regex array; centralizing the
// classification keeps the surfaces in agreement and lets new event kinds
// declare their tier in one place.

import type { LogEntry, LogEvent, LogEventKind, PlayerId } from "@/engine/state";

// Strategically meaningful events. These are what the ribbon shows
// persistently and what gets the "you were targeted" treatment.
export const MUST_SHOW_KINDS: ReadonlySet<LogEventKind> = new Set<LogEventKind>([
  "slyDeal",
  "forcedDeal",
  "dealBreaker",
  "debtCollector",
  "birthday",
  "rent",
  "justSayNo",
  "jsnCanceled",
  "pay",
  "debtForgiven",
  "setComplete",
  "setBroken",
  "houseDetached",
  "hotelDetached",
  "win",
]);

// MUST_SHOW plus a handful of "good to surface" events (house/hotel placement,
// pass-go bursts). Drives the Toasts and the sheet's "Big plays" filter.
export const SIGNAL_KINDS: ReadonlySet<LogEventKind> = new Set<LogEventKind>([
  ...MUST_SHOW_KINDS,
  "house",
  "hotel",
  "passGo",
]);

// Routine bookkeeping — useful for review in the sheet's "All" filter, but
// never bubble up to the ribbon or toast.
export const NOISE_KINDS: ReadonlySet<LogEventKind> = new Set<LogEventKind>([
  "gameStart",
  "draw",
  "playProperty",
  "playMoney",
  "reassignWild",
  "discardToLimit",
  "reshuffle",
  "turnStart",
]);

export function isMustShow(entry: LogEntry): boolean {
  // Forced Deal swaps may arrive without a structured event but with the
  // legacy `swap` payload — treat those as must-show too.
  if (entry.event && MUST_SHOW_KINDS.has(entry.event.kind)) return true;
  if (entry.swap) return true;
  return false;
}

export function isSignal(entry: LogEntry): boolean {
  if (entry.event && SIGNAL_KINDS.has(entry.event.kind)) return true;
  if (entry.swap) return true;
  return false;
}

// True when the entry directly involves the local player as a defender,
// payer, or counter-target. Used for the "louder + lingers" treatment on
// ribbon and the sheet's "Targeted me" filter.
export function isTargetingSelf(entry: LogEntry, selfId: string | undefined): boolean {
  if (!selfId) return false;
  const e: LogEvent | undefined = entry.event;
  if (e) {
    if (e.targetId === selfId) return true;
    if (e.targetIds?.includes(selfId)) return true;
    // `pay` events list the payer in `actorId` and the recipient in `targetId`;
    // either side cares about a "transaction involving me." Already covered by
    // the actor/target checks above, but make it explicit for readability.
    if (e.actorId === selfId && e.kind === "pay") return true;
  }
  if (entry.swap?.targetId === selfId) return true;
  return false;
}

// Walk back through the log to find the most recent must-show entry. Used by
// the ribbon so a quiet `playMoney` after a Rent doesn't push the Rent off
// the persistent surface.
export function lastMustShow(log: LogEntry[]): LogEntry | null {
  for (let i = log.length - 1; i >= 0; i--) {
    const entry = log[i]!;
    if (isMustShow(entry)) return entry;
  }
  return null;
}

// Re-export the player id type so callers don't need to dig into engine paths.
export type { PlayerId };
