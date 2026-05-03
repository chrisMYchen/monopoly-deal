"use client";

import { Card } from "./Card";
import { SET_DEFS, cardById, type SetColor } from "@/engine/cards";
import { rentForGroup } from "@/engine/selectors";
import type { PropertySet } from "@/engine/state";

export function PropertySetsView({
  propertySets,
  compact,
  onCardClick,
  selectableCardIds,
  selectedCardId,
  // Cards that should briefly pulse with a "just changed hands" highlight —
  // used by Forced Deal so both swapped properties stand out in their new
  // owner's play area until the player has visually registered what happened.
  flashingCardIds,
}: {
  propertySets: PropertySet[];
  compact?: boolean;
  onCardClick?: (cardId: string, color: SetColor, groupIdx: number) => void;
  selectableCardIds?: Set<string>;
  selectedCardId?: string;
  flashingCardIds?: Set<string>;
}) {
  if (propertySets.length === 0) {
    return <div className="text-xs opacity-50">no properties</div>;
  }
  return (
    <div className="flex flex-wrap gap-2">
      {propertySets.map((group, gi) => {
        const def = SET_DEFS[group.color];
        const complete = group.cardIds.length >= def.complete;
        const rent = rentForGroup(group);
        return (
          <div
            key={`${group.color}-${gi}`}
            className={[
              "flex flex-col gap-1 rounded-md border p-1",
              complete ? "border-yellow-400/70 bg-yellow-400/10" : "border-white/15 bg-white/5",
            ].join(" ")}
            data-testid={`property-set-${group.color}-${gi}`}
            data-complete={complete}
          >
            <div className="flex items-center justify-between gap-2 px-1 text-[10px] uppercase tracking-widest opacity-70">
              <span className="capitalize">
                {group.color} {group.cardIds.length}/{def.complete}
              </span>
              <span className="flex items-center gap-1">
                {/* Rent value at-a-glance: experts read this; beginners see */}
                {/* immediately how much rent costs for each color. */}
                <span
                  className="rounded bg-emerald-300/15 px-1 font-mono text-emerald-200"
                  title={
                    complete
                      ? `Rent: $${rent}M${group.hasHouse || group.hasHotel ? " (with H/H)" : ""}`
                      : `Rent at this size: $${rent}M`
                  }
                >
                  ${rent}M
                </span>
                {(group.hasHouse || group.hasHotel) && (
                  <span className="rounded bg-amber-200 px-1 text-amber-900">
                    {group.hasHouse && "🏠"}
                    {group.hasHotel && "🏨"}
                  </span>
                )}
              </span>
            </div>
            <div className="flex gap-1">
              {group.cardIds.map((cid) => {
                const isSelectable = selectableCardIds?.has(cid);
                const isFlashing = flashingCardIds?.has(cid);
                const c = cardById(cid);
                const isWild = c.kind === "wild2" || c.kind === "wild10";
                return (
                  <div
                    key={cid}
                    className={[
                      "relative",
                      // Cyan pulse + halo so the swapped card pops out of the
                      // play area without the user having to compare states. The
                      // ring offset matches the existing "selected" treatment
                      // so the visual language stays consistent.
                      isFlashing
                        ? "rounded-md ring-2 ring-cyan-300 ring-offset-2 ring-offset-zinc-900 shadow-[0_0_24px_-4px_rgba(103,232,249,0.65)] animate-pulse"
                        : "",
                    ].join(" ")}
                  >
                    <Card
                      cardId={cid}
                      size={compact ? "sm" : "md"}
                      selected={selectedCardId === cid}
                      onClick={
                        onCardClick && isSelectable
                          ? () => onCardClick(cid, group.color, gi)
                          : undefined
                      }
                    />
                    {isWild && (
                      <span
                        className="pointer-events-none absolute -right-1 -top-1 rounded-full border border-zinc-900 bg-yellow-300 px-1 text-[8px] font-bold uppercase tracking-widest text-zinc-900 shadow"
                        title={
                          c.kind === "wild2"
                            ? `Wild (${c.sets[0]}/${c.sets[1]}) — tap on your turn to reassign (free)`
                            : "Rainbow wild — tap on your turn to reassign (free)"
                        }
                      >
                        ★
                      </span>
                    )}
                    {isFlashing && (
                      <span
                        className="pointer-events-none absolute -top-2 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full border border-cyan-300/80 bg-cyan-500/95 px-1.5 py-[1px] text-[9px] font-bold uppercase tracking-widest text-white shadow"
                        aria-hidden
                      >
                        Swapped
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
