"use client";

// Compact "X/3 sets toward win" badge. Visible at a glance for both beginners
// (reminds them of the goal) and experts (track threat: who's about to win?).
// Three small dots fill in as the player completes distinct-color sets.

export function SetProgress({
  count,
  highlight,
}: {
  count: number;
  highlight?: boolean;
}) {
  const filled = Math.min(count, 3);
  const remaining = 3 - filled;
  return (
    <span
      className={[
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em]",
        highlight && count >= 2
          ? "bg-[var(--color-accent-tint)] text-[var(--color-accent-deep)]" // 2/3 = stakes
          : highlight
            ? "bg-[var(--color-tint)] text-[var(--color-ink-soft)]"
            : "bg-[var(--color-tint)] text-[var(--color-ink-faint)]",
      ].join(" ")}
      title={`${count} of 3 distinct-color complete sets toward winning`}
      aria-label={`${count} of 3 sets toward winning`}
    >
      <span className="flex gap-0.5">
        {Array.from({ length: filled }).map((_, i) => (
          <span
            key={`f${i}`}
            className="h-1.5 w-1.5 rounded-full bg-current"
            aria-hidden
          />
        ))}
        {Array.from({ length: remaining }).map((_, i) => (
          <span
            key={`r${i}`}
            className="h-1.5 w-1.5 rounded-full border border-current opacity-40"
            aria-hidden
          />
        ))}
      </span>
      {count}/3
    </span>
  );
}
