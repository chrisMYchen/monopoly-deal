"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";

import { ACTION_ART, ACTION_THEME } from "./card-art";
import {
  ACTION_DESCRIPTIONS,
  ACTION_LABELS,
  SET_DEFS,
  cardById,
  type Card as CardData,
  type CardId,
  type SetColor,
} from "@/engine/cards";

const SET_BG: Record<SetColor, string> = {
  brown: "bg-[var(--color-set-brown)]",
  lightBlue: "bg-[var(--color-set-light-blue)]",
  pink: "bg-[var(--color-set-pink)]",
  orange: "bg-[var(--color-set-orange)]",
  red: "bg-[var(--color-set-red)]",
  yellow: "bg-[var(--color-set-yellow)]",
  green: "bg-[var(--color-set-green)]",
  darkBlue: "bg-[var(--color-set-dark-blue)]",
  railroad: "bg-[var(--color-set-railroad)]",
  utility: "bg-[var(--color-set-utility)]",
};

// Display label per color group, shown on the property card's color band.
const SET_LABEL: Record<SetColor, string> = {
  brown: "Brown",
  lightBlue: "Light Blue",
  pink: "Pink",
  orange: "Orange",
  red: "Red",
  yellow: "Yellow",
  green: "Green",
  darkBlue: "Dark Blue",
  railroad: "Railroad",
  utility: "Utility",
};

// Whether the color band is dark enough that we should overlay light text on it.
const SET_BAND_INK: Record<SetColor, string> = {
  brown: "text-white",
  lightBlue: "text-zinc-900",
  pink: "text-white",
  orange: "text-white",
  red: "text-white",
  yellow: "text-zinc-900",
  green: "text-white",
  darkBlue: "text-white",
  railroad: "text-white",
  utility: "text-zinc-900",
};

export type CardSize = "sm" | "md" | "lg";

const SIZE_CLS: Record<CardSize, string> = {
  sm: "w-[64px] h-[88px] text-[10px]",
  md: "w-[100px] h-[140px] text-xs",
  lg: "w-[160px] h-[224px] text-sm",
};

export function Card({
  cardId,
  size = "md",
  selected,
  onClick,
  ariaLabel,
  // When `animated` is true, the card uses Motion's `layoutId` so movements
  // between hand → tableau → discard / opponent zones tween smoothly.
  // Pass `animated={false}` for cards rendered inside modals/pickers where
  // multiple instances of the same id can co-exist (which would confuse Motion).
  animated = true,
}: {
  cardId: CardId;
  size?: CardSize;
  selected?: boolean;
  onClick?: () => void;
  ariaLabel?: string;
  animated?: boolean;
}) {
  const card = cardById(cardId);
  const [peeking, setPeeking] = useState(false);

  const className = [
    SIZE_CLS[size],
    "relative flex flex-col overflow-hidden rounded-md border border-black/30 bg-white text-zinc-900 shadow-md transition-all duration-150",
    selected
      ? "ring-2 ring-yellow-300 ring-offset-2 ring-offset-zinc-900 -translate-y-2 shadow-[0_8px_20px_-6px_rgba(253,224,71,0.45)]"
      : "",
    onClick
      ? "cursor-pointer hover:-translate-y-1 hover:shadow-lg"
      : "cursor-default",
  ].join(" ");

  // Inspector: right-click (desktop) or long-press (touch) opens a popover
  // with the card's full mechanic description, without committing a play.
  const onContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setPeeking((p) => !p);
  };
  let pressTimer: number | undefined;
  const onTouchStart = () => {
    pressTimer = window.setTimeout(() => setPeeking(true), 450);
  };
  const onTouchEnd = () => {
    if (pressTimer) window.clearTimeout(pressTimer);
  };

  const tooltip = (
    <AnimatePresence>
      {peeking && (
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 4 }}
          transition={{ duration: 0.12 }}
          className="absolute left-1/2 top-[calc(100%+6px)] z-30 w-56 -translate-x-1/2 rounded-md border border-white/20 bg-zinc-900 px-2 py-1.5 text-[11px] leading-snug text-white shadow-xl"
          role="tooltip"
          onClick={(e) => {
            e.stopPropagation();
            setPeeking(false);
          }}
        >
          <div className="font-semibold">{cardLabel(card)}</div>
          <div className="mt-0.5 opacity-80">{describeCard(card)}</div>
          <div className="mt-1 text-[10px] uppercase tracking-widest opacity-50">
            tap to dismiss
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  if (animated) {
    return (
      <div className="relative">
        <motion.button
          type="button"
          layoutId={`card-${cardId}`}
          onClick={onClick}
          onContextMenu={onContextMenu}
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
          onTouchCancel={onTouchEnd}
          aria-label={ariaLabel ?? cardLabel(card)}
          data-card-id={cardId}
          data-card-kind={card.kind}
          className={className}
          transition={{ type: "spring", stiffness: 380, damping: 32 }}
        >
          {renderCard(card, size)}
        </motion.button>
        {tooltip}
      </div>
    );
  }
  return (
    <div className="relative">
      <button
        type="button"
        onClick={onClick}
        onContextMenu={onContextMenu}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
        aria-label={ariaLabel ?? cardLabel(card)}
        data-card-id={cardId}
        data-card-kind={card.kind}
        className={className}
      >
        {renderCard(card, size)}
      </button>
      {tooltip}
    </div>
  );
}

// Plain-language description for the inspector popover.
function describeCard(card: CardData): string {
  switch (card.kind) {
    case "money":
      return `Money. Banked face-up for $${card.value}M.`;
    case "property":
      return `${SET_LABEL[card.set]} property, $${card.value}M when banked. Rent ladder: ${SET_DEFS[card.set].rentLadder.join(" / ")}.`;
    case "wild2":
      return `Property Wild Card — joins ${SET_LABEL[card.sets[0]]} or ${SET_LABEL[card.sets[1]]} groups. Cannot be banked.`;
    case "wild10":
      return "Multicolor Property Wild — joins any color group already in play. Cannot be banked.";
    case "action":
      return `${ACTION_DESCRIPTIONS[card.action]} Banked sideways for $${card.value}M.`;
  }
}

function renderCard(card: CardData, size: CardSize) {
  switch (card.kind) {
    case "money":
      return <MoneyFace value={card.value} />;
    case "property":
      return <PropertyFace card={card} size={size} />;
    case "wild2":
      return <Wild2Face sets={card.sets} />;
    case "wild10":
      return <Wild10Face />;
    case "action":
      if (card.action === "rent") return <RentFace card={card} />;
      return <ActionFace card={card} />;
  }
}

// ---------------------------------------------------------------------------
// Money face — bold dollar amount on a faint mint background. Mirrors the
// look of real Monopoly Deal money cards (front: subtle pattern, big number).
// ---------------------------------------------------------------------------

function MoneyFace({ value }: { value: 1 | 2 | 3 | 4 | 5 | 10 }) {
  const tint =
    value === 10
      ? "bg-amber-100 text-amber-900"
      : value >= 4
        ? "bg-emerald-100 text-emerald-900"
        : value >= 2
          ? "bg-sky-100 text-sky-900"
          : "bg-zinc-100 text-zinc-700";
  return (
    <div className={`flex h-full w-full flex-col items-center justify-center ${tint}`}>
      <div className="text-[0.55em] font-semibold uppercase tracking-[0.25em] opacity-60">Bank</div>
      <div className="font-display text-[2.6em] leading-none tracking-tight">${value}M</div>
      <div className="mt-1 text-[0.5em] uppercase tracking-[0.2em] opacity-50">{value} million</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Property face — color band on top, name + rent ladder, bank value badge.
// Layout mirrors classic Monopoly Deal property cards.
// ---------------------------------------------------------------------------

function PropertyFace({
  card,
  size,
}: {
  card: Extract<CardData, { kind: "property" }>;
  size: CardSize;
}) {
  const ladder = SET_DEFS[card.set].rentLadder;
  return (
    <div className="flex h-full w-full flex-col">
      <div className={`${SET_BG[card.set]} flex h-[28%] items-end px-1.5 pb-0.5`}>
        <div
          className={`text-[0.55em] font-semibold uppercase tracking-[0.2em] ${SET_BAND_INK[card.set]} opacity-90`}
        >
          {SET_LABEL[card.set]}
        </div>
      </div>
      <div className="flex flex-1 flex-col items-center justify-center px-1 text-center">
        <div className="font-display text-[1.15em] uppercase leading-[1.05] tracking-[0.01em] text-zinc-900">
          {size === "sm" ? abbreviateProperty(card.name) : card.name}
        </div>
        <div className="mt-1.5 flex items-center gap-1 text-[0.55em] font-semibold uppercase tracking-[0.18em] opacity-55">
          <span>Rent</span>
          <span className="font-mono tracking-tight">{ladder.join(" · ")}</span>
        </div>
      </div>
      <div className="flex items-center justify-between px-1.5 pb-1 text-[0.6em] uppercase tracking-[0.15em] opacity-70">
        <span className="rounded bg-zinc-100 px-1 py-0.5 font-mono">${card.value}M</span>
        <span className="opacity-60">Deed</span>
      </div>
    </div>
  );
}

// Compact form used at the smallest card size where full names won't fit.
function abbreviateProperty(name: string): string {
  return name
    .replace(/Avenue/g, "Ave.")
    .replace(/Place/g, "Pl.")
    .replace(/Railroad/g, "RR")
    .replace(/Mediterranean/g, "Med.")
    .replace(/Pennsylvania/g, "Penn.")
    .replace(/Connecticut/g, "Conn.")
    .replace(/North Carolina/g, "N. Carolina")
    .replace(/St\. Charles/g, "St. Charles")
    .replace(/St\. James/g, "St. James");
}

// ---------------------------------------------------------------------------
// Property Wild Cards
// ---------------------------------------------------------------------------

function Wild2Face({ sets }: { sets: [SetColor, SetColor] }) {
  return (
    <div className="flex h-full w-full flex-col">
      <div className="grid h-[40%] w-full grid-cols-2">
        <div className={SET_BG[sets[0]]} />
        <div className={SET_BG[sets[1]]} />
      </div>
      <div className="flex flex-1 flex-col items-center justify-center px-1 text-center">
        <div className="font-display text-[1.4em] uppercase leading-none tracking-[0.02em] text-zinc-900">
          Wild
        </div>
        <div className="mt-1 text-[0.55em] font-semibold uppercase tracking-[0.15em] opacity-65">
          {SET_LABEL[sets[0]]} / {SET_LABEL[sets[1]]}
        </div>
      </div>
      <div className="px-1.5 pb-1 text-[0.5em] font-semibold uppercase tracking-[0.18em] opacity-60">
        Property Wild
      </div>
    </div>
  );
}

function Wild10Face() {
  return (
    <div className="flex h-full w-full flex-col">
      <div className="grid h-[40%] w-full grid-cols-5 grid-rows-2">
        <div className="bg-[var(--color-set-brown)]" />
        <div className="bg-[var(--color-set-light-blue)]" />
        <div className="bg-[var(--color-set-pink)]" />
        <div className="bg-[var(--color-set-orange)]" />
        <div className="bg-[var(--color-set-red)]" />
        <div className="bg-[var(--color-set-yellow)]" />
        <div className="bg-[var(--color-set-green)]" />
        <div className="bg-[var(--color-set-dark-blue)]" />
        <div className="bg-[var(--color-set-railroad)]" />
        <div className="bg-[var(--color-set-utility)]" />
      </div>
      <div className="flex flex-1 flex-col items-center justify-center text-center">
        <div className="font-display text-[1.4em] uppercase leading-none tracking-[0.02em] text-zinc-900">
          Wild
        </div>
        <div className="mt-1 text-[0.55em] font-semibold uppercase tracking-[0.18em] opacity-65">
          Any color
        </div>
      </div>
      <div className="px-1.5 pb-1 text-[0.5em] font-semibold uppercase tracking-[0.18em] opacity-60">
        Multicolor
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Action face — saturated background, white illustration, bold title block.
// ---------------------------------------------------------------------------

function ActionFace({ card }: { card: Extract<CardData, { kind: "action" }> }) {
  const theme = ACTION_THEME[card.action];
  const Art = ACTION_ART[card.action];
  const label = ACTION_LABELS[card.action];

  return (
    <div
      className="flex h-full w-full flex-col"
      style={{ backgroundColor: theme.bg, color: theme.ink }}
    >
      {/* top tag — "ACTION" + bank chip */}
      <div className="flex items-center justify-between px-1.5 pt-1 text-[0.55em] font-semibold uppercase tracking-[0.2em] opacity-80">
        <span>Action</span>
        <span
          className="rounded-sm bg-white/85 px-1 py-[1px] font-mono text-zinc-900"
          style={{ color: "#0c0c0c" }}
        >
          ${card.value}M
        </span>
      </div>

      {/* illustration — fills the middle band */}
      <div className="flex flex-1 items-center justify-center px-2 py-1">
        <Art className="h-full w-full max-h-[64%]" />
      </div>

      {/* white banner with the action title */}
      <div className="bg-white px-1 py-1 text-center">
        <div className="font-display text-[1.1em] uppercase leading-[1.05] tracking-[0.02em] text-zinc-900">
          {label}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Rent face — color bands at the top show which property colors this rent
// targets. Two stripes for 2-color rents; full 10-color grid for the wild ★.
// Mirrors the look of real Monopoly Deal rent cards (which are dominated by
// the color identification, not a single themed background).
// ---------------------------------------------------------------------------

function RentFace({ card }: { card: Extract<CardData, { kind: "action" }> }) {
  const Art = ACTION_ART.rent;
  const sets = card.rentSets ?? [];
  const isWild = card.rentSingleTarget === true;

  return (
    <div className="flex h-full w-full flex-col bg-white text-zinc-900">
      {/* color bands — two horizontal stripes for 2-color rent, 5x2 grid for wild ★ */}
      {isWild ? (
        <div className="grid h-[34%] w-full grid-cols-5 grid-rows-2">
          <div className="bg-[var(--color-set-brown)]" />
          <div className="bg-[var(--color-set-light-blue)]" />
          <div className="bg-[var(--color-set-pink)]" />
          <div className="bg-[var(--color-set-orange)]" />
          <div className="bg-[var(--color-set-red)]" />
          <div className="bg-[var(--color-set-yellow)]" />
          <div className="bg-[var(--color-set-green)]" />
          <div className="bg-[var(--color-set-dark-blue)]" />
          <div className="bg-[var(--color-set-railroad)]" />
          <div className="bg-[var(--color-set-utility)]" />
        </div>
      ) : (
        <div className="flex h-[34%] w-full flex-col">
          {sets.map((c, i) => (
            <div key={i} className={`${SET_BG[c]} flex-1`} />
          ))}
        </div>
      )}

      {/* top tag row — "ACTION" + bank chip, sitting on white */}
      <div className="flex items-center justify-between px-1.5 pt-1 text-[0.55em] font-semibold uppercase tracking-[0.2em] text-zinc-500">
        <span>Action</span>
        <span className="rounded-sm bg-zinc-100 px-1 py-[1px] font-mono text-zinc-900">
          ${card.value}M
        </span>
      </div>

      {/* illustration + title — fills the middle band */}
      <div className="flex flex-1 flex-col items-center justify-center gap-1 px-2 py-1">
        <Art className="h-full w-full max-h-[58%] text-[var(--color-action-rent)]" />
        <div className="font-display text-[1.1em] uppercase leading-[1.05] tracking-[0.02em] text-zinc-900">
          {isWild ? "★ Rent" : "Rent"}
        </div>
      </div>
    </div>
  );
}

export function cardLabel(card: CardData): string {
  switch (card.kind) {
    case "money":
      return `Money $${card.value}M`;
    case "property":
      return `${card.name} (${SET_LABEL[card.set]})`;
    case "wild2":
      return `Property Wild ${SET_LABEL[card.sets[0]]}/${SET_LABEL[card.sets[1]]}`;
    case "wild10":
      return "Multicolor Property Wild";
    case "action":
      return ACTION_LABELS[card.action];
  }
}

// ---------------------------------------------------------------------------
// Card back — Monopoly Deal red treatment with a subtle "MD" monogram.
// ---------------------------------------------------------------------------

export function CardBack({ size = "md", count }: { size?: CardSize; count?: number }) {
  return (
    <div
      className={[
        SIZE_CLS[size],
        "relative flex flex-col items-center justify-center overflow-hidden rounded-md border border-red-950 bg-gradient-to-br from-red-600 to-red-800 text-white shadow-md",
      ].join(" ")}
      aria-label={`Deck of ${count ?? "?"} cards`}
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-20"
        style={{
          backgroundImage:
            "repeating-linear-gradient(45deg, rgba(255,255,255,0.18) 0 2px, transparent 2px 8px)",
        }}
      />
      <div className="relative z-10 flex flex-col items-center px-1 text-center">
        <div className="font-display text-[1.55em] uppercase leading-none tracking-tight drop-shadow">
          Monopoly
        </div>
        <div className="mt-0.5 font-display text-[1.1em] uppercase leading-none tracking-[0.25em] opacity-95">
          Deal
        </div>
      </div>
      {typeof count === "number" && (
        <div className="relative z-10 mt-2 rounded-full bg-white/15 px-2 py-[1px] font-mono text-[0.7em]">
          {count}
        </div>
      )}
    </div>
  );
}
