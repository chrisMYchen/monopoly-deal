"use client";

// Canonical Monopoly green house silhouette. Based on the plastic house
// piece from the physical board game — pitched roof, tiny chimney, square
// body. 16×16 viewbox, currentColor fill (default canon green).

import type { SVGProps } from "react";

export function HouseIcon({
  size = 16,
  fill = "var(--color-set-green)",
  ...rest
}: { size?: number; fill?: string } & Omit<SVGProps<SVGSVGElement>, "size" | "fill">) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill={fill}
      aria-label="House"
      {...rest}
    >
      {/* Roof — steeper than a real house, like the plastic piece */}
      <path d="M2 8 L8 2 L14 8 L13 8 L13 14 L3 14 L3 8 Z" />
      {/* Chimney — tiny rectangle on the roof */}
      <rect x="10.5" y="3" width="1.5" height="2.5" />
      {/* Door — small dark notch */}
      <rect x="6.5" y="10" width="3" height="4" fill="rgba(0,0,0,0.35)" />
      {/* Roof shadow line for definition */}
      <path d="M2 8 L8 2 L14 8" fill="none" stroke="rgba(0,0,0,0.2)" strokeWidth="0.4" />
    </svg>
  );
}
