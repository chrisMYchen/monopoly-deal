"use client";

// Monopoly game tokens as monochrome SVG glyphs. Replaces the initials-circle
// avatars with the canonical 8 pieces players physically hold in Monopoly:
// top hat, scottie, car, boot, battleship, thimble, wheelbarrow, race horse.
//
// Each glyph is a single-color silhouette inheriting `currentColor`. 24×24
// viewbox, ~500 bytes inline. The token IS the player identity; this is the
// single biggest IP signal in the app — anyone who's seen Monopoly knows
// these instantly.

import type { ReactElement, SVGProps } from "react";

export type TokenKind =
  | "topHat"
  | "scottie"
  | "car"
  | "boot"
  | "battleship"
  | "thimble"
  | "wheelbarrow"
  | "raceHorse";

export const ALL_TOKENS: TokenKind[] = [
  "topHat",
  "scottie",
  "car",
  "boot",
  "battleship",
  "thimble",
  "wheelbarrow",
  "raceHorse",
];

export const TOKEN_LABELS: Record<TokenKind, string> = {
  topHat: "Top hat",
  scottie: "Scottie",
  car: "Car",
  boot: "Boot",
  battleship: "Battleship",
  thimble: "Thimble",
  wheelbarrow: "Wheelbarrow",
  raceHorse: "Race horse",
};

// Deterministic hash (FNV-1a 32-bit, mirrors lib/playerColor.ts) → token index.
function hashStr(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h >>> 0;
}

export function tokenForPlayerId(id: string): TokenKind {
  return ALL_TOKENS[hashStr(id) % ALL_TOKENS.length]!;
}

export function TokenGlyph({
  kind,
  size = 24,
  ...rest
}: { kind: TokenKind; size?: number } & Omit<SVGProps<SVGSVGElement>, "size">) {
  const Component = GLYPHS[kind];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-label={TOKEN_LABELS[kind]}
      {...rest}
    >
      <Component />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Glyphs — silhouettes hand-tuned to read at 24px. Single fill, currentColor.
// ---------------------------------------------------------------------------

function TopHat() {
  return (
    <>
      {/* Brim */}
      <ellipse cx="12" cy="20" rx="9" ry="1.6" />
      {/* Crown */}
      <rect x="6.5" y="5" width="11" height="14" rx="0.6" />
      {/* Hatband */}
      <rect x="6.5" y="14.5" width="11" height="1.6" fill="#FFF" opacity="0.001" />
    </>
  );
}

function Scottie() {
  // Stylized side profile of a Scottish Terrier
  return (
    <path d="M3 16 L3 12 Q3 9 5.5 9 L7 9 L7 7 Q7 6 8 6 L9 6 L10 4.5 L11 6 L13 6 L14 7 L18 7 Q20 7 20 9 L20 11 L21 11 L21 13 L20 13 L20 16 L18.5 16 L18.5 19 L17 19 L17 17 L13 17 L13 19 L11.5 19 L11.5 17 L8 17 L8 19 L6.5 19 L6.5 17 L5 17 L5 16 Z" />
  );
}

function Car() {
  // Roadster side view
  return (
    <>
      {/* Body */}
      <path d="M3 14 L3 12 Q3 11 4 11 L7 11 L9 8 L15 8 L17 11 L20 11 Q21 11 21 12 L21 14 Q21 15 20 15 L18.5 15 A2 2 0 0 0 14.5 15 L9.5 15 A2 2 0 0 0 5.5 15 L4 15 Q3 15 3 14 Z" />
      {/* Wheels */}
      <circle cx="7.5" cy="16.5" r="2" />
      <circle cx="16.5" cy="16.5" r="2" />
    </>
  );
}

function Boot() {
  // High-top boot silhouette
  return (
    <path d="M8 3 L13 3 Q14 3 14 4 L14 12 L19 12 Q21 12 21 14 L21 17 Q21 19 19 19 L7 19 Q5 19 5 17 L5 14 Q5 12 7 12 L8 12 Z" />
  );
}

function Battleship() {
  // Ship with hull, deck, stack, mast
  return (
    <>
      {/* Hull */}
      <path d="M2 16 L22 16 L20 19 L4 19 Z" />
      {/* Deck */}
      <rect x="6" y="13" width="11" height="3" />
      {/* Smokestack */}
      <rect x="13" y="9" width="2" height="4" />
      {/* Mast */}
      <rect x="9" y="5" width="0.8" height="8" />
      {/* Crow's nest */}
      <rect x="8" y="6.5" width="2.8" height="1.2" />
    </>
  );
}

function Thimble() {
  return (
    <>
      {/* Body */}
      <path d="M7 7 L17 7 L16 18 L8 18 Z" />
      {/* Cap dimples (small dots) */}
      <circle cx="10" cy="10" r="0.6" fill="#FFF" opacity="0.001" />
      <circle cx="13" cy="10" r="0.6" fill="#FFF" opacity="0.001" />
      <circle cx="11.5" cy="12" r="0.6" fill="#FFF" opacity="0.001" />
    </>
  );
}

function Wheelbarrow() {
  return (
    <>
      {/* Tray */}
      <path d="M3 9 L18 9 L16 15 L7 15 Z" />
      {/* Handle */}
      <rect x="17" y="9" width="4" height="1.4" rx="0.6" transform="rotate(20 19 9.7)" />
      {/* Wheel */}
      <circle cx="6" cy="17.5" r="2" />
      {/* Front leg */}
      <rect x="14" y="15" width="1.2" height="3.5" />
    </>
  );
}

function RaceHorse() {
  // Stylized horse + jockey — abstract running silhouette
  return (
    <path d="M4 17 L4 15 Q5 13 7 13 L8 13 L7 11 L9 10 L11 12 L14 12 L15 9 L17 9 L18 11 L20 11 Q21 11 21 12 L20 14 L18 14 L17 17 L15 17 L15.5 14 L11.5 14 L10 17 L8 17 L8.5 15 L6 15 L6 17 Z" />
  );
}

const GLYPHS: Record<TokenKind, () => ReactElement> = {
  topHat: TopHat,
  scottie: Scottie,
  car: Car,
  boot: Boot,
  battleship: Battleship,
  thimble: Thimble,
  wheelbarrow: Wheelbarrow,
  raceHorse: RaceHorse,
};
