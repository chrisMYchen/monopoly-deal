"use client";

// Mr. Monopoly (Rich Uncle Pennybags) — monochrome silhouette as a tasteful
// IP signal. Three placements only:
//   - favicon (head variant)
//   - lobby empty seat (standing variant)
//   - winner row on ResultsScreen (tipHat variant)
//
// Hand-drawn paths inheriting `currentColor`. Top hat + monocle + mustache
// + bowtie are the recognizable canon features.

import type { SVGProps } from "react";

export type MrMonopolyVariant = "head" | "standing" | "tipHat";

export type MrMonopolyProps = Omit<SVGProps<SVGSVGElement>, "children"> & {
  variant?: MrMonopolyVariant;
  size?: number;
};

export function MrMonopoly({
  variant = "standing",
  size = 96,
  ...rest
}: MrMonopolyProps) {
  if (variant === "head") {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 64 64"
        fill="currentColor"
        aria-label="Mr. Monopoly"
        {...rest}
      >
        <Head />
      </svg>
    );
  }
  if (variant === "tipHat") {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 64 64"
        fill="currentColor"
        aria-label="Mr. Monopoly tipping his hat"
        {...rest}
      >
        <TipHat />
      </svg>
    );
  }
  return (
    <svg
      width={size}
      height={size * 1.6}
      viewBox="0 0 64 102"
      fill="currentColor"
      aria-label="Mr. Monopoly"
      {...rest}
    >
      <Standing />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Head only — favicon and small accent
// ---------------------------------------------------------------------------
function Head() {
  return (
    <>
      {/* Top hat brim */}
      <ellipse cx="32" cy="20" rx="22" ry="2.5" />
      {/* Top hat crown */}
      <rect x="18" y="2" width="28" height="18" rx="1" />
      {/* Hatband */}
      <rect x="18" y="14" width="28" height="3" fill="#FFF" opacity="0.001" />
      {/* Head */}
      <ellipse cx="32" cy="34" rx="13" ry="11" />
      {/* Mustache — broad walrus */}
      <path d="M22 38 Q26 41 32 39 Q38 41 42 38 Q40 42 32 42 Q24 42 22 38 Z" fill="#FFF" opacity="0.001" />
      <path d="M22 38 Q26 41 32 39 Q38 41 42 38 Q40 42 32 42 Q24 42 22 38 Z" />
      {/* Monocle */}
      <circle cx="38" cy="30" r="3.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
      {/* Monocle string */}
      <path d="M40 33 Q43 38 41 44" fill="none" stroke="currentColor" strokeWidth="1.2" />
      {/* Eyes (both) — subtle dots */}
      <circle cx="27" cy="30" r="1.3" fill="#FFF" opacity="0.001" />
      <circle cx="38" cy="30" r="0.9" />
      {/* Bowtie below head */}
      <path d="M26 48 L32 44 L38 48 L38 54 L32 50 L26 54 Z" />
      {/* Collar */}
      <path d="M22 50 L32 56 L42 50 L42 58 L22 58 Z" />
    </>
  );
}

// ---------------------------------------------------------------------------
// Standing full body — lobby empty seat
// ---------------------------------------------------------------------------
function Standing() {
  return (
    <>
      {/* Re-use head paths positioned at the top */}
      <g>
        <ellipse cx="32" cy="20" rx="22" ry="2.5" />
        <rect x="18" y="2" width="28" height="18" rx="1" />
        <ellipse cx="32" cy="34" rx="13" ry="11" />
        <path d="M22 38 Q26 41 32 39 Q38 41 42 38 Q40 42 32 42 Q24 42 22 38 Z" />
        <circle cx="38" cy="30" r="3.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
        <path d="M40 33 Q43 38 41 44" fill="none" stroke="currentColor" strokeWidth="1.2" />
        <circle cx="38" cy="30" r="0.9" />
      </g>
      {/* Bowtie */}
      <path d="M26 48 L32 44 L38 48 L38 54 L32 50 L26 54 Z" />
      {/* Coat — wide, tailcoat silhouette */}
      <path d="M14 52 L22 52 L22 58 L42 58 L42 52 L50 52 L52 84 L48 84 L46 70 L46 88 L18 88 L18 70 L16 84 L12 84 Z" />
      {/* Coat lapels */}
      <path d="M22 58 L32 70 L42 58 L42 64 L32 72 L22 64 Z" fill="#FFF" opacity="0.001" />
      {/* Cane in right hand */}
      <line x1="6" y1="58" x2="6" y2="96" stroke="currentColor" strokeWidth="1.6" />
      <path d="M6 58 Q3 56 3 60" stroke="currentColor" strokeWidth="1.6" fill="none" />
      {/* Hand on cane */}
      <circle cx="9" cy="60" r="2.4" />
      {/* Pants peeking below coat */}
      <rect x="22" y="88" width="6" height="10" />
      <rect x="36" y="88" width="6" height="10" />
      {/* Shoes */}
      <ellipse cx="25" cy="100" rx="5" ry="1.6" />
      <ellipse cx="39" cy="100" rx="5" ry="1.6" />
    </>
  );
}

// ---------------------------------------------------------------------------
// Tipping his hat — winner accent
// ---------------------------------------------------------------------------
function TipHat() {
  return (
    <>
      {/* Hat tipped slightly to the side */}
      <g transform="rotate(-12 32 16)">
        <ellipse cx="32" cy="20" rx="20" ry="2.2" />
        <rect x="20" y="4" width="24" height="17" rx="1" />
      </g>
      {/* Head (slightly lower since hat is lifted) */}
      <ellipse cx="32" cy="36" rx="12" ry="10" />
      <path d="M22 40 Q26 43 32 41 Q38 43 42 40 Q40 44 32 44 Q24 44 22 40 Z" />
      <circle cx="38" cy="32" r="3.2" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <path d="M40 35 Q43 40 41 46" fill="none" stroke="currentColor" strokeWidth="1.1" />
      {/* Bowtie + collar */}
      <path d="M26 50 L32 46 L38 50 L38 56 L32 52 L26 56 Z" />
      <path d="M22 52 L32 58 L42 52 L42 60 L22 60 Z" />
      {/* Tipping arm */}
      <path d="M14 14 Q8 18 8 24 L11 26 Q11 22 16 20 Z" />
    </>
  );
}
