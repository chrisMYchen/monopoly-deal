"use client";

// At-a-glance plays-remaining indicator. Mirrors TurnTimerPill's visual
// language so the two read as a pair on the sticky turn banner.
//
// States:
//   pre-draw   : muted "Draw" pill (player hasn't drawn yet this turn)
//   3 plays    : neutral pill, 3 filled dots
//   2 plays    : neutral pill, 2 filled / 1 hollow
//   1 play     : amber pill, 1 filled / 2 hollow
//   0 plays    : dim pill, all hollow ("End turn")
//
// `dim` lowers contrast when this isn't the viewer's own turn — still
// readable, but doesn't compete with the active player's pill.
const MAX_PLAYS = 3;

export function PlaysPill({
  playsRemaining,
  hasDrawn,
  dim,
}: {
  playsRemaining: number;
  hasDrawn: boolean;
  dim?: boolean;
}) {
  if (!hasDrawn) {
    return (
      <span
        className={[
          "inline-flex h-6 items-center gap-1 rounded-full border px-2 text-xs font-medium",
          dim
            ? "border-white/15 bg-white/5 text-white/70"
            : "border-blue-300/50 bg-blue-400/15 text-blue-100",
        ].join(" ")}
        data-testid="plays-pill"
        data-state="needs-draw"
        aria-label="Needs to draw"
        title="Draw to start your turn"
      >
        <span aria-hidden>↓</span> Draw
      </span>
    );
  }

  const remaining = Math.max(0, Math.min(MAX_PLAYS, playsRemaining));
  const tier: "ok" | "low" | "none" =
    remaining === 0 ? "none" : remaining === 1 ? "low" : "ok";

  const palette = dim
    ? {
        ok: "border-white/15 bg-white/5 text-white/70",
        low: "border-amber-300/40 bg-amber-400/10 text-amber-100/80",
        none: "border-white/10 bg-white/5 text-white/40",
      }[tier]
    : {
        ok: "border-white/20 bg-white/10 text-white/90",
        low: "border-amber-300/60 bg-amber-400/15 text-amber-100 shadow-[0_0_10px_rgba(251,191,36,0.25)]",
        none: "border-white/10 bg-white/5 text-white/50",
      }[tier];

  const dotFilled = dim ? "bg-white/70" : "bg-white";
  const dotFilledLow = dim ? "bg-amber-200/80" : "bg-amber-200";
  const dotHollow = "bg-transparent border border-white/40";

  return (
    <span
      className={[
        "inline-flex h-6 items-center gap-1.5 rounded-full border px-2 text-xs font-medium tabular-nums transition-all duration-200",
        palette,
      ].join(" ")}
      data-testid="plays-pill"
      data-state={tier}
      data-remaining={remaining}
      role="status"
      aria-label={`${remaining} of ${MAX_PLAYS} plays remaining`}
      title={
        remaining === 0
          ? "No plays left — end your turn"
          : `${remaining} ${remaining === 1 ? "play" : "plays"} remaining`
      }
    >
      <span className="flex items-center gap-[3px]" aria-hidden>
        {Array.from({ length: MAX_PLAYS }).map((_, i) => {
          const filled = i < remaining;
          const cls = !filled
            ? dotHollow
            : tier === "low"
              ? dotFilledLow
              : dotFilled;
          return (
            <span
              key={i}
              className={[
                "block h-1.5 w-1.5 rounded-full transition-colors",
                cls,
              ].join(" ")}
            />
          );
        })}
      </span>
      <span>
        {remaining}
        <span className="opacity-60"> plays</span>
      </span>
    </span>
  );
}
