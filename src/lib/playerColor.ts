// Stable per-player color derived from the session id. Visual identity only —
// no info leak (the id is already public). 5-color palette tuned to look
// distinct on parchment AND on the deep-teal inked chrome.

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

// Avatar solids retuned for legibility on both light parchment AND deep teal.
// The tones lean rich + slightly desaturated rather than primary brights —
// they read as players rather than as alerts.
const PALETTE: PlayerColor[] = [
  // Indigo: cool, confident — for the host slot most often
  {
    name: "indigo",
    border: "border-[#3D5AFE]/55",
    bg: "bg-[#3D5AFE]/10",
    solid: "bg-[#3D5AFE]",
    text: "text-white",
  },
  // Rose: warm, friendly
  {
    name: "rose",
    border: "border-[#E04E5C]/55",
    bg: "bg-[#E04E5C]/10",
    solid: "bg-[#E04E5C]",
    text: "text-white",
  },
  // Amber: bright, gold-leaning so it pairs with the brand gold
  {
    name: "amber",
    border: "border-[#E8A52B]/55",
    bg: "bg-[#E8A52B]/10",
    solid: "bg-[#E8A52B]",
    text: "text-[var(--color-inked)]",
  },
  // Emerald: lush green, harmonizes with felt
  {
    name: "emerald",
    border: "border-[#2F8F70]/55",
    bg: "bg-[#2F8F70]/10",
    solid: "bg-[#2F8F70]",
    text: "text-white",
  },
  // Sky: cool blue with enough lift to read on parchment
  {
    name: "sky",
    border: "border-[#3FA0CC]/55",
    bg: "bg-[#3FA0CC]/10",
    solid: "bg-[#3FA0CC]",
    text: "text-white",
  },
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
