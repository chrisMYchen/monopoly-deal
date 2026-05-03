"use client";

import { Card } from "./Card";
import { HouseIcon } from "./icons/HouseIcon";
import { HotelIcon } from "./icons/HotelIcon";
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
  // Owner of these sets — used as an animation anchor (data-player-id +
  // data-set-color let the AnimationLayer locate this group's bounding box
  // for confetti, glow, and big-number floats).
  playerId,
}: {
  propertySets: PropertySet[];
  compact?: boolean;
  onCardClick?: (cardId: string, color: SetColor, groupIdx: number) => void;
  selectableCardIds?: Set<string>;
  selectedCardId?: string;
  flashingCardIds?: Set<string>;
  playerId?: string;
}) {
  if (propertySets.length === 0) {
    return <div className="text-xs text-[var(--color-ink-faint)]">no properties</div>;
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
              "flex flex-col gap-1 rounded-lg border-[1.5px] p-1.5 transition-colors",
              complete
                ? "border-[var(--color-accent)] bg-[var(--color-accent-tint)]"
                : "border-[var(--color-ink)]/15 bg-[var(--color-card)]",
            ].join(" ")}
            data-testid={`property-set-${group.color}-${gi}`}
            data-complete={complete}
            data-player-id={playerId}
            data-set-color={group.color}
          >
            <div className="flex items-center justify-between gap-2 px-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-ink-soft)]">
              <span className="capitalize">
                {group.color} {group.cardIds.length}/{def.complete}
              </span>
              <span className="flex items-center gap-1">
                {/* Rent value at-a-glance */}
                <span
                  className="tabular rounded bg-[var(--color-tint)] px-1 font-bold text-[var(--color-ink)]"
                  title={
                    complete
                      ? `Rent: $${rent}M${group.hasHouse || group.hasHotel ? " (with H/H)" : ""}`
                      : `Rent at this size: $${rent}M`
                  }
                >
                  ${rent}M
                </span>
                {(group.hasHouse || group.hasHotel) && (
                  <span className="inline-flex items-center gap-0.5">
                    {group.hasHouse && (
                      <HouseIcon size={14} aria-label="House" />
                    )}
                    {group.hasHotel && (
                      <HotelIcon size={14} aria-label="Hotel" />
                    )}
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
                      // Red pulse on freshly swapped cards — matches the brand accent
                      // so the cue reads as "what changed" without introducing a
                      // separate signal color.
                      isFlashing
                        ? "rounded-md ring-2 ring-[var(--color-accent)] ring-offset-2 ring-offset-[var(--color-felt)] animate-pulse"
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
                        className="pointer-events-none absolute -right-1 -top-1 rounded-full border border-[var(--color-ink)] bg-[var(--color-warning)] px-1 text-[8px] font-bold uppercase tracking-widest text-[var(--color-ink)]"
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
                        className="pointer-events-none absolute -top-2 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-[var(--color-accent)] px-1.5 py-[1px] text-[9px] font-bold uppercase tracking-widest text-[var(--color-ink-on-dark)]"
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
