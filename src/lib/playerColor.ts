// Stable per-player color derived from the session id. Visual identity only —
// no info leak (the id is already public). 5-color palette tuned to look
// distinct against the dark felt background.

export type PlayerColor = {
  name: string;
  // Tailwind border class for the chip / avatar ring.
  border: string;
  // Tailwind background tint (subtle, used inside chip backgrounds).
  bg: string;
  // Solid background for the avatar circle.
  solid: string;
  // Text color that reads well against `solid`.
  text: string;
};

const PALETTE: PlayerColor[] = [
  { name: "indigo", border: "border-indigo-300/70", bg: "bg-indigo-300/10", solid: "bg-indigo-500", text: "text-white" },
  { name: "rose", border: "border-rose-300/70", bg: "bg-rose-300/10", solid: "bg-rose-500", text: "text-white" },
  { name: "amber", border: "border-amber-300/70", bg: "bg-amber-300/10", solid: "bg-amber-400", text: "text-zinc-900" },
  { name: "emerald", border: "border-emerald-300/70", bg: "bg-emerald-300/10", solid: "bg-emerald-500", text: "text-white" },
  { name: "sky", border: "border-sky-300/70", bg: "bg-sky-300/10", solid: "bg-sky-500", text: "text-white" },
];

// Cheap deterministic hash → palette index. FNV-1a 32-bit; good enough for
// color spread on a small number of player ids.
function hashStr(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h >>> 0;
}

export function colorForPlayerId(id: string): PlayerColor {
  return PALETTE[hashStr(id) % PALETTE.length]!;
}

// Initials for avatar text. "Alice Anderson" → "AA", "Bob" → "B".
export function initialsForName(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
}
