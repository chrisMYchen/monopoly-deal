"use client";

// Brand wordmark — the canonical Monopoly logotype treatment paired with
// "Deal" in Source Serif 4. The single strongest IP signal in the app.
//
// Anatomy:
//   ┌──────────────┐
//  ╔│  MONOPOLY   │╗  Deal
//   └──────────────┘
//
// "MONOPOLY" sits inside a red box with a thin white inner outline and a
// thin black outer outline (canonical signature). "Deal" sits beside it
// in bold serif. The whole mark is a single inline SVG so it scales as
// one piece.

export type WordmarkProps = {
  size?: "sm" | "md" | "lg";
  // When true, render only the red MONOPOLY box (no "Deal"). Used inside
  // CardBack and the small corner brand stamp.
  markOnly?: boolean;
  className?: string;
};

const SIZES = {
  sm: { boxH: 22, mFont: 11, dealFont: "text-xl" },
  md: { boxH: 32, mFont: 16, dealFont: "text-3xl" },
  lg: { boxH: 56, mFont: 28, dealFont: "text-5xl sm:text-6xl" },
};

export function Wordmark({ size = "md", markOnly, className }: WordmarkProps) {
  const dims = SIZES[size];
  return (
    <span
      className={[
        "inline-flex items-baseline gap-3 align-middle leading-none",
        className ?? "",
      ].join(" ")}
    >
      <MonopolyMark heightPx={dims.boxH} fontPx={dims.mFont} />
      {!markOnly && (
        <span
          className={[
            "font-display font-bold tracking-tight text-[var(--color-ink)]",
            dims.dealFont,
          ].join(" ")}
        >
          Deal
        </span>
      )}
    </span>
  );
}

// The canonical red-box logotype mark. SVG so the proportions stay perfect
// at any size and the double outline (white inside, black outside) renders
// crisply without 1px rendering surprises.
function MonopolyMark({ heightPx, fontPx }: { heightPx: number; fontPx: number }) {
  // Aspect: roughly 3.6:1 (canonical box is wide). Compute width from height.
  const widthPx = Math.round(heightPx * 3.6);
  const padX = Math.round(heightPx * 0.18);
  // Letter spacing tuned so "MONOPOLY" fills the box edge-to-edge minus padding.
  return (
    <svg
      width={widthPx}
      height={heightPx}
      viewBox={`0 0 ${widthPx} ${heightPx}`}
      aria-label="Monopoly"
      className="shrink-0 align-middle"
    >
      {/* Outer black border (1.5px equivalent at md size) */}
      <rect
        x="0"
        y="0"
        width={widthPx}
        height={heightPx}
        rx={Math.max(2, heightPx * 0.08)}
        fill="#0A0A0A"
      />
      {/* Inner white border (the canonical signature) */}
      <rect
        x={Math.max(1, heightPx * 0.04)}
        y={Math.max(1, heightPx * 0.04)}
        width={widthPx - Math.max(1, heightPx * 0.04) * 2}
        height={heightPx - Math.max(1, heightPx * 0.04) * 2}
        rx={Math.max(2, heightPx * 0.06)}
        fill="#FFFFFF"
      />
      {/* Red fill */}
      <rect
        x={Math.max(2, heightPx * 0.1)}
        y={Math.max(2, heightPx * 0.1)}
        width={widthPx - Math.max(2, heightPx * 0.1) * 2}
        height={heightPx - Math.max(2, heightPx * 0.1) * 2}
        rx={Math.max(1, heightPx * 0.04)}
        fill="var(--color-accent)"
      />
      {/* MONOPOLY text — tight sans caps, white */}
      <text
        x={widthPx / 2}
        y={heightPx / 2}
        textAnchor="middle"
        dominantBaseline="central"
        fontFamily="var(--font-sans)"
        fontWeight="900"
        fontSize={fontPx}
        letterSpacing={fontPx * 0.04}
        fill="#FFFFFF"
      >
        MONOPOLY
      </text>
    </svg>
  );
}
