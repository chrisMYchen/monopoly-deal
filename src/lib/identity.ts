// Browser-local identity. Each player has a session id the worker uses to
// re-attach them to their seat across reconnects.
//
// Storage:
//   - Default: localStorage, keyed PER ROOM CODE (`rr.session.{CODE}`). This
//     survives tab close, in-app browser back-out, and mobile memory eviction
//     — sessionStorage would not. Scoping by room means opening a *different*
//     room in a second tab still gives a separate identity (as before); only
//     re-entering the *same* room collapses to one identity, which the worker
//     handles by closing the older socket on rejoin.
//   - Dev escape hatch (`?asName=Alice`): per-tab id keyed by name in
//     sessionStorage so the gstack/sim harness can spawn N tabs as N players.
//
// The display name lives in `localStorage` so the home page auto-fills it
// across tabs.

const NAME_KEY = "rr.name";
// One-shot marker the home page sets right before navigating into /r/?code=X
// so the joiner page knows the stored name was *just* picked here and can skip
// the confirmation prompt. Invitees arriving via a shared link don't have it,
// so they always see the name confirmation step.
const FRESH_NAME_KEY = "rr.nameFreshlyConfirmed";

const SESSION_KEY_PREFIX = "rr.session.";
// Legacy single-id key (sessionStorage). Read once for migration so an
// in-flight player keeps their seat across the deploy that introduces this
// per-room scheme. Never written.
const LEGACY_SESSION_KEY = "rr.sessionId";

function sessionKeyForRoom(roomCode: string): string {
  return SESSION_KEY_PREFIX + roomCode.toUpperCase();
}

// Returns the stable session id for `roomCode`, creating one if absent.
// Survives tab close and mobile memory pressure.
export function getOrCreateSessionId(roomCode: string): string {
  if (typeof window === "undefined") return "";
  const code = roomCode.toUpperCase();
  if (!code) return "";
  const key = sessionKeyForRoom(code);

  let id: string | null = null;
  try {
    id = window.localStorage.getItem(key);
  } catch {
    // localStorage disabled (private mode quirks, storage quota, etc.)
  }
  if (!id) {
    // One-shot migration: a player mid-game when this code ships still has
    // their old tab-scoped id in sessionStorage. Adopt it once so they don't
    // get bounced.
    try {
      const legacy = window.sessionStorage.getItem(LEGACY_SESSION_KEY);
      if (legacy) id = legacy;
    } catch {
      // ignore
    }
  }
  if (!id) id = newSessionId();
  try {
    window.localStorage.setItem(key, id);
  } catch {
    // ignore — id is still returned, just not persisted
  }
  return id;
}

// Dev/sim only: a per-tab session id keyed by `asName` so multiple tabs of
// the same room (spawned by the gstack harness) act as distinct players.
// Lives in sessionStorage so it dies with the tab, which is what the harness
// expects.
export function getOrCreateDevSessionId(roomCode: string, asName: string): string {
  if (typeof window === "undefined") return "";
  const key = `rr.devSession.${roomCode.toUpperCase()}.${asName}`;
  let id: string | null = null;
  try {
    id = window.sessionStorage.getItem(key);
  } catch {
    // ignore
  }
  if (!id) {
    id = newSessionId();
    try {
      window.sessionStorage.setItem(key, id);
    } catch {
      // ignore
    }
  }
  return id;
}

export function newSessionId(): string {
  // Simple random 16-byte id encoded as hex. crypto.randomUUID is widely
  // supported but kept this self-contained for SSR-safety.
  const bytes = new Uint8Array(16);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function getStoredName(): string {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(NAME_KEY) ?? "";
}

export function setStoredName(name: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(NAME_KEY, name);
}

// Reset per-room session — used when explicitly leaving so we don't re-attach
// to a room we already left. Currently unused; kept for future "leave seat"
// affordances.
export function resetSession(roomCode: string): void {
  if (typeof window === "undefined") return;
  const code = roomCode.toUpperCase();
  if (!code) return;
  try {
    window.localStorage.setItem(sessionKeyForRoom(code), newSessionId());
  } catch {
    // ignore
  }
}

export function markNameFreshlyConfirmed(): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(FRESH_NAME_KEY, "1");
}

// Reads + clears the fresh-name marker. Returns true once per home-page hop;
// any subsequent reload of /r/ sees the prompt again as a normal invitee would.
export function consumeFreshNameMarker(): boolean {
  if (typeof window === "undefined") return false;
  const v = window.sessionStorage.getItem(FRESH_NAME_KEY);
  if (v) window.sessionStorage.removeItem(FRESH_NAME_KEY);
  return v === "1";
}
