// Moment detector. Reads the projection log and surfaces interesting events
// since the last call. We define moments externally rather than baking them
// into the engine — keeps the engine pure and lets us tune what's worth
// capturing without reshaping ProjectedGameState.

import type { ProjectedGameState } from "@/engine/project";
import type { LogEventKind } from "@/engine/state";

// Which log-event kinds we treat as worth screenshotting. Everything else
// (draw, playMoney, playProperty, reshuffle) is too frequent to be useful.
const MOMENT_KINDS: ReadonlySet<LogEventKind> = new Set<LogEventKind>([
  "setComplete",
  "setBroken",
  "dealBreaker",
  "forcedDeal",
  "slyDeal",
  "birthday",
  "rent",
  "debtCollector",
  "justSayNo",
  "jsnCanceled",
  "house",
  "hotel",
  "win",
]);

export type Moment = {
  // Index into projection.log of the entry that triggered this moment.
  logIdx: number;
  kind: LogEventKind;
  message: string;
};

export class MomentTracker {
  private lastSeenIdx = -1;

  // Returns moments newly observable in `state` since the last call.
  observe(state: ProjectedGameState): Moment[] {
    const log = state.log ?? [];
    const out: Moment[] = [];
    for (let i = this.lastSeenIdx + 1; i < log.length; i++) {
      const entry = log[i]!;
      const k = entry.event?.kind;
      if (k && MOMENT_KINDS.has(k)) {
        out.push({ logIdx: i, kind: k, message: entry.message });
      }
    }
    this.lastSeenIdx = log.length - 1;
    return out;
  }
}
