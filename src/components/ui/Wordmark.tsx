"use client";

// Brand wordmark: "Monopoly Deal" set in Fraunces (var(--font-display)) with
// a small gold-rimmed coin glyph as a visual anchor. Used on Home + Lobby.
// Pure typography + inline SVG — no external assets.

export type WordmarkProps = {
  size?: "sm" | "md" | "lg";
  // Stack words on two lines (defaults to single line on lg, single elsewhere).
  stacked?: boolean;
  className?: string;
};

const SIZES = {
  sm: { coin: 22, text: "text-2xl" },
  md: { coin: 32, text: "text-4xl" },
  lg: { coin: 48, text: "text-6xl sm:text-7xl" },
};

export function Wordmark({ size = "md", stacked, className }: WordmarkProps) {
  const dims = SIZES[size];
  return (
    <div
      className={[
        "inline-flex items-center gap-3 font-display font-semibold tracking-tight text-[var(--color-ink)]",
        dims.text,
        className ?? "",
      ].join(" ")}
    >
      <Coin px={dims.coin} />
      {stacked ? (
        <span className="leading-[0.95]">
          <span className="block">Monopoly</span>
          <span className="block italic text-[var(--color-accent)]">Deal</span>
        </span>
      ) : (
        <span className="leading-none">
          Monopoly{" "}
          <span className="italic text-[var(--color-accent)]">Deal</span>
        </span>
      )}
    </div>
  );
}

function Coin({ px }: { px: number }) {
  // Gold coin with a deep-teal $ glyph. Self-contained SVG.
  return (
    <svg
      width={px}
      height={px}
      viewBox="0 0 48 48"
      fill="none"
      aria-hidden
      className="shrink-0 drop-shadow-[0_2px_4px_rgba(15,42,46,0.18)]"
    >
      <circle cx="24" cy="24" r="22" fill="var(--color-gold)" />
      <circle
        cx="24"
        cy="24"
        r="22"
        fill="none"
        stroke="var(--color-gold-deep)"
        strokeWidth="2"
      />
      <circle
        cx="24"
        cy="24"
        r="17"
        fill="none"
        stroke="var(--color-gold-deep)"
        strokeWidth="1.2"
        opacity="0.55"
      />
      <text
        x="24"
        y="32"
        textAnchor="middle"
        fontFamily="var(--font-display)"
        fontWeight="700"
        fontSize="22"
        fill="var(--color-inked)"
      >
        $
      </text>
    </svg>
  );
}
