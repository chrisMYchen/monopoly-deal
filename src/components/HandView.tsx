"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { useDraggable } from "@dnd-kit/core";

import { Card } from "./Card";
import { cardById, type CardId } from "@/engine/cards";
import { handSortKey } from "@/engine/selectors";

type SortMode = "asis" | "kind";

export function HandView({
  hand,
  selectedCardId,
  onSelect,
}: {
  hand: CardId[];
  selectedCardId: CardId | null;
  onSelect: (cardId: CardId | null) => void;
}) {
  const [sort, setSort] = useState<SortMode>("asis");

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

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2 px-2 text-[11px] uppercase tracking-widest opacity-70">
        <span>Hand · {hand.length}</span>
        <button
          onClick={() => setSort((s) => (s === "asis" ? "kind" : "asis"))}
          className="rounded border border-white/15 px-1.5 py-0.5 hover:bg-white/5"
          title={sort === "asis" ? "Group by category" : "Restore draw order"}
          data-testid="hand-sort"
        >
          Sort: {sort === "asis" ? "draw order" : "by kind"}
        </button>
      </div>
      <motion.div
        layout
        className="flex flex-nowrap items-end justify-start gap-2 overflow-x-auto px-2 py-2"
        role="region"
        aria-label="Your hand"
      >
        {sorted.map((cid) => (
          <DraggableCard
            key={cid}
            cardId={cid}
            selected={selectedCardId === cid}
            onSelect={() => onSelect(selectedCardId === cid ? null : cid)}
          />
        ))}
        {hand.length === 0 && <div className="text-xs opacity-50">hand is empty</div>}
      </motion.div>
    </div>
  );
}

// Hand card wrapped in dnd-kit's useDraggable. Tap still fires onSelect for
// the existing tap+button workflow; drag is the additional gesture. The
// activation distance prevents accidental drags on small finger movements.
function DraggableCard({
  cardId,
  selected,
  onSelect,
}: {
  cardId: CardId;
  selected: boolean;
  onSelect: () => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `hand-${cardId}`,
    data: { cardId, source: "hand" },
  });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={`shrink-0 ${isDragging ? "opacity-30" : ""}`}
    >
      <Card cardId={cardId} size="md" selected={selected} onClick={onSelect} />
    </div>
  );
}
