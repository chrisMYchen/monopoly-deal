// Per-player gameplay assists, persisted in localStorage. Both default ON —
// they only remove busywork, never make a strategic choice:
//   autoDraw     — send DRAW_TURN_START ~600ms after your turn starts. The
//                  start-of-turn draw is mandatory and choice-free.
//   autoEndTurn  — at 0 plays remaining with nothing pending, end the turn
//                  after a cancellable countdown. The countdown (not a hard
//                  auto-end) exists because free wildcard reassignment after
//                  your last play is a real defensive move.
// Mirrors the pattern in animations/preferences.ts.

import { useEffect, useState } from "react";

const AUTO_DRAW_OFF_KEY = "rr.assist.autodraw.off";
const AUTO_END_OFF_KEY = "rr.assist.autoend.off";

const listeners = new Set<() => void>();

function read(key: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function write(key: string, value: boolean): void {
  if (typeof window === "undefined") return;
  try {
    if (value) window.localStorage.setItem(key, "1");
    else window.localStorage.removeItem(key);
  } catch {
    // Ignore storage failures (private mode, quota).
  }
}

export function isAutoDrawEnabled(): boolean {
  return !read(AUTO_DRAW_OFF_KEY);
}

export function setAutoDrawEnabled(enabled: boolean): void {
  write(AUTO_DRAW_OFF_KEY, !enabled);
  for (const l of listeners) l();
}

export function isAutoEndTurnEnabled(): boolean {
  return !read(AUTO_END_OFF_KEY);
}

export function setAutoEndTurnEnabled(enabled: boolean): void {
  write(AUTO_END_OFF_KEY, !enabled);
  for (const l of listeners) l();
}

export function subscribeAssistPrefs(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// React view of the prefs. Starts with defaults (SSR-safe) and syncs on mount.
export function useAssistPrefs(): { autoDraw: boolean; autoEndTurn: boolean } {
  const [prefs, setPrefs] = useState({ autoDraw: true, autoEndTurn: true });
  useEffect(() => {
    const sync = () =>
      setPrefs({ autoDraw: isAutoDrawEnabled(), autoEndTurn: isAutoEndTurnEnabled() });
    sync();
    return subscribeAssistPrefs(sync);
  }, []);
  return prefs;
}
