"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { useDraggable } from "@dnd-kit/core";

import { Card, type CardSize } from "./Card";
import { cardById, type CardId } from "@/engine/cards";
import { HAND_LIMIT } from "@/engine/reduce";
import { handSortKey } from "@/engine/selectors";

type SortMode = "asis" | "kind";

// Hand cards drop to `sm` below this container width so a typical 5-card
// opening hand fits without overlap. Above it, we render at `md`.
const DESKTOP_HAND_W = 524;

// Mirror of Card.tsx SIZE_CLS pixel widths — we need them in JS so the fan
// layout can compute step/overlap without measuring DOM nodes.
const CARD_W: Record<CardSize, number> = { sm: 64, md: 100, lg: 160 };
const CARD_H: Record<CardSize, number> = { sm: 88, md: 140, lg: 224 };

export function HandView({
  hand,
  selectedCardId,
  onSelect,
  dragDisabled = false,
}: {
  hand: CardId[];
  selectedCardId: CardId | null;
  onSelect: (cardId: CardId | null) => void;
  // Peek-to-play mode (mobile): dnd drag is off; dragging a card upward
  // selects it (opening the peek sheet) instead of starting a drag.
  dragDisabled?: boolean;
}) {
  const [sort, setSort] = useState<SortMode>("asis");
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerW, setContainerW] = useState(0);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setContainerW(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const sorted =
    sort === "asis"
      ? hand
      : [...hand].sort((a, b) => {
          const ka = handSortKey(cardById(a));
          const kb = handSortKey(cardById(b));
          if (ka[0] !== kb[0]) return ka[0] - kb[0];
          if (ka[1] !== kb[1]) return ka[1] - kb[1];
          return ka[2].localeCompare(kb[2]);
        });

  const size: CardSize = containerW >= DESKTOP_HAND_W ? "md" : "sm";
  const cardW = CARD_W[size];
  const cardH = CARD_H[size];
  const n = sorted.length;
  const naturalGap = 6;

  // Distance between consecutive card left-edges. Default = cardW + gap (no
  // overlap). If the row would overflow the container, tighten step so every
  // card fits — never scroll. Floor at 22px so even a heavily-overlapped
  // hand still exposes the color band + corner glyph for each card.
  let step = cardW + naturalGap;
  if (n > 1 && containerW > 0) {
    const maxFitStep = (containerW - cardW) / (n - 1);
    step = Math.max(22, Math.min(step, maxFitStep));
  }
  const totalW = n === 0 ? 0 : cardW + step * (n - 1);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2 px-2 text-[11px] uppercase tracking-widest opacity-70">
        {/* Hand limit is end-of-turn only: holding 8+ mid-turn is legal (and
            often correct), so this warns without blocking anything. */}
        {hand.length > HAND_LIMIT ? (
          <span className="font-bold text-white opacity-100" data-testid="hand-limit-warning">
            Hand · {hand.length} — keep {HAND_LIMIT} at end of turn
          </span>
        ) : (
          <span>Hand · {hand.length}</span>
        )}
        <button
          onClick={() => setSort((s) => (s === "asis" ? "kind" : "asis"))}
          className="rounded border border-white/15 px-1.5 py-0.5 hover:bg-white/5"
          title={sort === "asis" ? "Group by category" : "Restore draw order"}
          data-testid="hand-sort"
        >
          Sort: {sort === "asis" ? "draw order" : "by kind"}
        </button>
      </div>
      <div ref={containerRef} className="py-2" role="region" aria-label="Your hand">
        {n === 0 ? (
          <div
            className="flex items-center justify-center text-xs opacity-50"
            style={{ height: cardH }}
          >
            hand is empty
          </div>
        ) : (
          <motion.div
            layout
            className="relative mx-auto"
            style={{ width: totalW, height: cardH }}
          >
            {sorted.map((cid, i) => (
              <DraggableCard
                key={cid}
                cardId={cid}
                size={size}
                selected={selectedCardId === cid}
                onSelect={() => onSelect(selectedCardId === cid ? null : cid)}
                onPeek={() => onSelect(cid)}
                left={i * step}
                z={selectedCardId === cid ? 999 : i + 1}
                dragDisabled={dragDisabled}
              />
            ))}
          </motion.div>
        )}
      </div>
    </div>
  );
}

// Hand card wrapped in dnd-kit's useDraggable. Positioned absolutely so the
// fan layout can overlap cards without horizontal scroll. dnd-kit's overlay
// renders the drag preview, so the source stays in place (just dims).
//
// With dragDisabled (peek-to-play mode), dnd listeners are not attached;
// instead a small upward swipe selects the card — the same effect as a tap,
// so the "raise the card to look at it" instinct just works.
function DraggableCard({
  cardId,
  size,
  selected,
  onSelect,
  onPeek,
  left,
  z,
  dragDisabled,
}: {
  cardId: CardId;
  size: CardSize;
  selected: boolean;
  onSelect: () => void;
  onPeek: () => void;
  left: number;
  z: number;
  dragDisabled: boolean;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `hand-${cardId}`,
    data: { cardId, source: "hand" },
    disabled: dragDisabled,
  });
  const startYRef = useRef<number | null>(null);
  const swipeProps = dragDisabled
    ? {
        onTouchStart: (e: React.TouchEvent) => {
          startYRef.current = e.touches[0]?.clientY ?? null;
        },
        onTouchMove: (e: React.TouchEvent) => {
          const y = e.touches[0]?.clientY;
          if (startYRef.current != null && y != null && startYRef.current - y > 36) {
            startYRef.current = null;
            onPeek();
          }
        },
        onTouchEnd: () => {
          startYRef.current = null;
        },
      }
    : { ...attributes, ...listeners };
  return (
    <div
      ref={dragDisabled ? undefined : setNodeRef}
      {...swipeProps}
      className={`absolute top-0 ${isDragging ? "opacity-30" : ""}`}
      style={{ left: `${left}px`, zIndex: z }}
    >
      <Card cardId={cardId} size={size} selected={selected} onClick={onSelect} />
    </div>
  );
}
