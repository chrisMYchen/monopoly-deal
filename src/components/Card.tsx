"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  ArrowsLeftRight,
  Cake,
  Compass,
  CurrencyDollar,
  HandGrabbing,
  House,
  Buildings,
  Receipt,
  Shield,
  Sparkle,
  Hand,
} from "@phosphor-icons/react";

import {
  ACTION_DESCRIPTIONS,
  ACTION_LABELS,
  SET_DEFS,
  cardById,
  type ActionKind,
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
  // Keeps beginners learning while not wasting screen real estate by default.
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
          {renderCard(card)}
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
        {renderCard(card)}
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
      return `${card.set} property, $${card.value}M when banked. Rent ladder: ${SET_DEFS[card.set].rentLadder.join(" / ")}.`;
    case "wild2":
      return `Wild — joins ${card.sets[0]} or ${card.sets[1]} groups. Cannot be banked.`;
    case "wild10":
      return "Rainbow wild — joins any color, but must attach to a same-color group already in play. Cannot be banked.";
    case "action":
      return `${ACTION_DESCRIPTIONS[card.action]} Banked sideways for $${card.value}M.`;
  }
}

function renderCard(card: CardData) {
  switch (card.kind) {
    case "money":
      return (
        <div className="flex h-full w-full flex-col items-center justify-center bg-emerald-100 font-mono text-emerald-900">
          <div className="text-[1.2em]">${card.value}M</div>
          <div className="mt-1 text-[0.65em] uppercase tracking-widest opacity-60">Bank</div>
        </div>
      );

    case "property":
      return (
        <>
          <div className={`${SET_BG[card.set]} h-2/5 w-full`} />
          <div className="flex flex-1 flex-col items-center justify-center px-1 text-center">
            <div className="font-semibold leading-tight">{card.name}</div>
            <div className="mt-1 font-mono opacity-60">${card.value}M</div>
            <div className="mt-1 font-mono text-[0.7em] opacity-50">
              {SET_DEFS[card.set].rentLadder.join(" · ")}
            </div>
          </div>
        </>
      );

    case "wild2":
      return (
        <>
          <div className="grid h-2/5 w-full grid-cols-2">
            <div className={`${SET_BG[card.sets[0]]}`} />
            <div className={`${SET_BG[card.sets[1]]}`} />
          </div>
          <div className="flex flex-1 flex-col items-center justify-center text-center">
            <div className="font-semibold">Wild</div>
            <div className="mt-1 text-[0.7em] opacity-60">
              {card.sets[0]} / {card.sets[1]}
            </div>
          </div>
        </>
      );

    case "wild10":
      return (
        <>
          <div className="grid h-2/5 w-full grid-cols-5 grid-rows-2">
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
          <div className="flex flex-1 flex-col items-center justify-center">
            <div className="font-bold">Rainbow</div>
            <div className="text-[0.7em] opacity-60">Any color</div>
          </div>
        </>
      );

    case "action": {
      const Icon = ACTION_ICONS[card.action];
      return (
        <div className="flex h-full w-full flex-col items-center justify-center bg-amber-50 px-1 text-center">
          <div className="text-[0.7em] uppercase tracking-widest opacity-60">Action</div>
          <Icon size={28} weight="duotone" className="my-1 text-amber-700" />
          <div className="font-bold leading-tight">{ACTION_LABELS[card.action]}</div>
          <div className="mt-1 font-mono opacity-60">${card.value}M</div>
          {card.action === "rent" && card.rentSets && (
            <div className="mt-0.5 text-[0.6em] opacity-50">
              {card.rentSingleTarget ? "★ Any color" : card.rentSets.join("/")}
            </div>
          )}
        </div>
      );
    }
  }
}

// Mapping action card kinds → Phosphor icons (duotone style for warm tabletop feel).
const ACTION_ICONS: Record<ActionKind, React.ComponentType<{ size?: number; weight?: "thin" | "light" | "regular" | "bold" | "fill" | "duotone"; className?: string }>> = {
  dealBreaker: HandGrabbing, // hostile takeover
  justSayNo: Shield, // counter
  slyDeal: Hand, // swipe
  forcedDeal: ArrowsLeftRight, // tribute
  debtCollector: CurrencyDollar, // eviction
  birthday: Cake, // tip jar
  doubleRent: Sparkle, // doubler
  house: House,
  hotel: Buildings,
  passGo: Compass, // round trip
  rent: Receipt,
};

export function cardLabel(card: CardData): string {
  switch (card.kind) {
    case "money":
      return `Money $${card.value}M`;
    case "property":
      return `${card.name} (${card.set})`;
    case "wild2":
      return `Wild ${card.sets[0]}/${card.sets[1]}`;
    case "wild10":
      return "Rainbow Wild";
    case "action":
      return ACTION_LABELS[card.action];
  }
}

// Simple back-of-card visual for the deck.
export function CardBack({ size = "md", count }: { size?: CardSize; count?: number }) {
  return (
    <div
      className={[
        SIZE_CLS[size],
        "flex flex-col items-center justify-center rounded-md border border-amber-900 bg-gradient-to-br from-amber-700 to-amber-900 text-amber-100 shadow-md",
      ].join(" ")}
      aria-label={`Deck of ${count ?? "?"} cards`}
    >
      <div className="font-bold uppercase tracking-widest">Realty</div>
      <div className="text-[0.7em] opacity-70">Royale</div>
      {typeof count === "number" && (
        <div className="mt-2 rounded-full bg-amber-100/20 px-2 text-[0.7em]">{count}</div>
      )}
    </div>
  );
}
