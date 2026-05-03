"use client";

import { SET_LABEL, cardById, type CardId, type SetColor } from "@/engine/cards";

// Compact colored chip for a property card in a log row. Replaces the
// near-duplicate CardChip / ToastChip that lived in GameLog.tsx and
// Toasts.tsx — same visual, two sizes.

const CHIP_BG: Record<SetColor, string> = {
  brown: "bg-[var(--color-set-brown)] text-white",
  lightBlue: "bg-[var(--color-set-light-blue)] text-zinc-900",
  pink: "bg-[var(--color-set-pink)] text-white",
  orange: "bg-[var(--color-set-orange)] text-white",
  red: "bg-[var(--color-set-red)] text-white",
  yellow: "bg-[var(--color-set-yellow)] text-zinc-900",
  green: "bg-[var(--color-set-green)] text-white",
  darkBlue: "bg-[var(--color-set-dark-blue)] text-white",
  railroad: "bg-[var(--color-set-railroad)] text-white",
  utility: "bg-[var(--color-set-utility)] text-zinc-900",
};

export function PropertyChip({
  cardId,
  color,
  size = "sm",
}: {
  cardId: CardId;
  color: SetColor;
  size?: "xs" | "sm";
}) {
  const c = cardById(cardId);
  const name =
    c.kind === "property"
      ? c.name
      : c.kind === "wild2"
        ? "Wild"
        : c.kind === "wild10"
          ? "★ Wild"
          : "card";
  return (
    <span
      className={[
        "inline-flex items-center rounded-sm font-semibold whitespace-nowrap",
        size === "xs"
          ? "px-1 py-[1px] text-[10px]"
          : "px-1.5 py-[1px] text-[12px]",
        CHIP_BG[color],
      ].join(" ")}
      title={`${name} — ${SET_LABEL[color]}`}
    >
      {name}
    </span>
  );
}

// A bare color chip (no card name) — used for set-level events like
// setComplete, dealBreaker, house, hotel.
export function SetColorChip({
  color,
  label,
  size = "sm",
}: {
  color: SetColor;
  label?: string;
  size?: "xs" | "sm";
}) {
  return (
    <span
      className={[
        "inline-flex items-center rounded-sm font-semibold uppercase tracking-wider whitespace-nowrap",
        size === "xs"
          ? "px-1 py-[1px] text-[10px]"
          : "px-1.5 py-[1px] text-[11px]",
        CHIP_BG[color],
      ].join(" ")}
      title={SET_LABEL[color]}
    >
      {label ?? SET_LABEL[color]}
    </span>
  );
}
