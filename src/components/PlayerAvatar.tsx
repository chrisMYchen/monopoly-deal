"use client";

import { TokenGlyph, tokenForPlayerId } from "./tokens";
import { TOKEN_LABELS } from "./tokens";

// Player identity = canonical Monopoly token. The token IS the avatar.
// Deterministic by player id (mirrors the colorForPlayerId hash so each
// session always shows the same token for the same player).
//
// Surface stays neutral (white card / dark felt) so the token itself
// carries the IP signal without the chip background fighting it.

export function PlayerAvatar({
  id,
  name,
  size = "md",
  onDark,
}: {
  id: string;
  name: string;
  size?: "sm" | "md" | "lg";
  // When true, render as a light glyph on a dark surface (felt / inked).
  onDark?: boolean;
}) {
  const token = tokenForPlayerId(id);
  const sizeCls =
    size === "sm" ? "h-7 w-7" :
    size === "lg" ? "h-12 w-12" :
    "h-9 w-9";
  const glyphPx =
    size === "sm" ? 18 :
    size === "lg" ? 30 :
    22;
  const surface = onDark
    ? "bg-[var(--color-tint)]/15 text-[var(--color-ink-on-dark)]"
    : "bg-[var(--color-tint)] text-[var(--color-ink)]";
  return (
    <span
      className={[
        "inline-flex shrink-0 items-center justify-center rounded-full",
        surface,
        sizeCls,
      ].join(" ")}
      aria-hidden
      title={`${name} — ${TOKEN_LABELS[token]}`}
    >
      <TokenGlyph kind={token} size={glyphPx} />
    </span>
  );
}
