// Mobile haptics via navigator.vibrate. No-op on desktop, when disabled,
// or when the API is unavailable. Patterns are deliberately tasteful —
// short single bumps and brief multi-pulse successes, no buzz.

import { isHapticsDisabled } from "./preferences";

type Pattern = number | number[];

const PATTERNS = {
  tap: 10 as Pattern,
  bump: 25 as Pattern,
  clash: [40, 30, 40] as Pattern,
  success: [25, 35, 25] as Pattern,
} as const;

function fire(pattern: Pattern): void {
  if (typeof window === "undefined") return;
  if (isHapticsDisabled()) return;
  if (typeof navigator === "undefined" || !navigator.vibrate) return;
  try {
    navigator.vibrate(pattern);
  } catch {
    // ignore
  }
}

export const haptics = {
  tap: () => fire(PATTERNS.tap),
  bump: () => fire(PATTERNS.bump),
  clash: () => fire(PATTERNS.clash),
  success: () => fire(PATTERNS.success),
};
