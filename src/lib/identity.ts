// Browser-local identity. Each player has a stable session id stored in
// `sessionStorage` so:
//   - Refreshing the tab preserves identity (reconnect path works)
//   - Opening a SECOND tab gets a NEW identity (so two tabs = two players,
//     and localStorage isn't a shared single-identity bottleneck)
// The display name lives in `localStorage` for convenience (auto-fills on the
// home page across tabs).

const NAME_KEY = "rr.name";
const SESSION_KEY = "rr.sessionId";
// One-shot marker the home page sets right before navigating into /r/?code=X
// so the joiner page knows the stored name was *just* picked here and can skip
// the confirmation prompt. Invitees arriving via a shared link don't have it,
// so they always see the name confirmation step.
const FRESH_NAME_KEY = "rr.nameFreshlyConfirmed";

export function getOrCreateSessionId(): string {
  if (typeof window === "undefined") return "";
  let id = window.sessionStorage.getItem(SESSION_KEY);
  if (!id) {
    id = newSessionId();
    window.sessionStorage.setItem(SESSION_KEY, id);
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
// to a room we already left.
export function resetSession(): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(SESSION_KEY, newSessionId());
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
