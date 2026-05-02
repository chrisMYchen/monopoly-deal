"use client";

import { Card } from "./Card";
import { SET_DEFS, cardById, type SetColor } from "@/engine/cards";
import { rentForGroup } from "@/engine/selectors";
import type { TableauGroup } from "@/engine/state";

export function TableauView({
  tableau,
  compact,
  onCardClick,
  selectableCardIds,
  selectedCardId,
}: {
  tableau: TableauGroup[];
  compact?: boolean;
  onCardClick?: (cardId: string, color: SetColor, groupIdx: number) => void;
  selectableCardIds?: Set<string>;
  selectedCardId?: string;
}) {
  if (tableau.length === 0) {
    return <div className="text-xs opacity-50">no properties</div>;
  }
  return (
    <div className="flex flex-wrap gap-2">
      {tableau.map((group, gi) => {
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
            data-testid={`tableau-${group.color}-${gi}`}
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
                const c = cardById(cid);
                const isWild = c.kind === "wild2" || c.kind === "wild10";
                return (
                  <div key={cid} className="relative">
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
                            ? `Wild (${c.sets[0]}/${c.sets[1]}) — tap on your turn to reassign`
                            : "Rainbow wild — tap on your turn to reassign"
                        }
                      >
                        ★
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
