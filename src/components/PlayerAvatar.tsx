"use client";

import { colorForPlayerId, initialsForName } from "@/lib/playerColor";

// Small circular badge — colored by player id, initials inside. Lets players
// tell each other apart at a glance in 3-5 player games without re-reading
// the name every time.

export function PlayerAvatar({
  id,
  name,
  size = "md",
}: {
  id: string;
  name: string;
  size?: "sm" | "md" | "lg";
}) {
  const color = colorForPlayerId(id);
  const sizeCls =
    size === "sm" ? "h-6 w-6 text-[10px]" :
    size === "lg" ? "h-10 w-10 text-base" :
    "h-7 w-7 text-xs";
  return (
    <span
      className={[
        "inline-flex shrink-0 items-center justify-center rounded-full font-semibold shadow-sm ring-1 ring-white/20",
        color.solid,
        color.text,
        sizeCls,
      ].join(" ")}
      aria-hidden
      title={name}
    >
      {initialsForName(name)}
    </span>
  );
}
