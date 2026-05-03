"use client";

// Canonical Monopoly red hotel silhouette. Based on the plastic hotel piece
// from the physical board — bigger, longer body, low-pitch roof, two
// chimneys. 16×16 viewbox, currentColor fill (default canon red).

import type { SVGProps } from "react";

export function HotelIcon({
  size = 16,
  fill = "var(--color-accent)",
  ...rest
}: { size?: number; fill?: string } & Omit<SVGProps<SVGSVGElement>, "size" | "fill">) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill={fill}
      aria-label="Hotel"
      {...rest}
    >
      {/* Roof — wide low-pitch */}
      <path d="M1 7 L8 3 L15 7 L14 7 L14 14 L2 14 L2 7 Z" />
      {/* Two chimneys */}
      <rect x="3.5" y="2.5" width="1.4" height="2.5" />
      <rect x="11.1" y="2.5" width="1.4" height="2.5" />
      {/* Windows in a 2×2 grid */}
      <rect x="4" y="9" width="2" height="2" fill="rgba(0,0,0,0.35)" />
      <rect x="10" y="9" width="2" height="2" fill="rgba(0,0,0,0.35)" />
      {/* Door */}
      <rect x="7" y="10" width="2" height="4" fill="rgba(0,0,0,0.4)" />
      {/* Roof shadow line */}
      <path d="M1 7 L8 3 L15 7" fill="none" stroke="rgba(0,0,0,0.2)" strokeWidth="0.4" />
    </svg>
  );
}
