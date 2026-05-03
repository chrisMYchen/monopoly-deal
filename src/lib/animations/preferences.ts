// User-controlled toggles for sound + haptics, persisted in localStorage.
// Both default ON. The audio layer additionally requires a user gesture
// before the browser will allow playback (browser autoplay policy) — we
// gate that separately via `markAudioUnlocked()`.

const SOUND_KEY = "rr.audio.muted";
const HAPTIC_KEY = "rr.haptics.disabled";

let audioUnlocked = false;
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

export function isAudioMuted(): boolean {
  return read(SOUND_KEY);
}

export function setAudioMuted(muted: boolean): void {
  write(SOUND_KEY, muted);
  for (const l of listeners) l();
}

export function isHapticsDisabled(): boolean {
  return read(HAPTIC_KEY);
}

export function setHapticsDisabled(disabled: boolean): void {
  write(HAPTIC_KEY, disabled);
  for (const l of listeners) l();
}

export function isAudioUnlocked(): boolean {
  return audioUnlocked;
}

export function markAudioUnlocked(): void {
  audioUnlocked = true;
  for (const l of listeners) l();
}

export function subscribePreferences(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}
