"use client";

import { useState } from "react";
import { useDroppable } from "@dnd-kit/core";

import { PropertySetsView } from "./PropertySetsView";
import { CardBack, Card } from "./Card";
import { PlayerAvatar } from "./PlayerAvatar";
import { SetProgress } from "./SetProgress";
import type { ProjectedPlayer } from "@/engine/project";
import { SET_DEFS, bankValueOf, cardById, type SetColor } from "@/engine/cards";
import { distinctCompletedSets } from "@/engine/selectors";
import { colorForPlayerId } from "@/lib/playerColor";

// On desktop we render a rich opponent block (full properties visible). On mobile
// we collapse to a tight horizontal row with name + hand count + bank total +
// color-coded set "chips" so the player can see at a glance:
//   - who's active
//   - how many cards each opponent has
//   - which colors each opponent is collecting (and how complete)
// without losing screen real estate to property art that they aren't acting on.

export function OpponentStrip({
  opponents,
  currentTurnPlayerId,
  onTargetClick,
  targetMode,
  flashingCardIds,
}: {
  opponents: ProjectedPlayer[];
  currentTurnPlayerId: string;
  onTargetClick?: (playerId: string) => void;
  targetMode?: boolean;
  // Cards that should pulse to highlight a recent swap. Forwarded into the
  // per-opponent PropertySetsView so a stolen/given property is unmistakable.
  flashingCardIds?: Set<string>;
}) {
  // Track which opponent (if any) the user has tapped to expand on mobile.
  // On desktop the full property area is always visible so this is a no-op.
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <>
      <div className="flex flex-col gap-2 p-2 sm:flex-row sm:flex-wrap sm:items-start sm:justify-center sm:gap-3">
        {opponents.map((p) => {
          const isActive = p.id === currentTurnPlayerId;
          const bankTotal = p.bank.reduce((s, cid) => s + bankValueOf(cardById(cid)), 0);
          const completedSets = distinctCompletedSets(p);
          const isThreat = completedSets >= 2; // 2/3 toward winning is "danger".
          const color = colorForPlayerId(p.id);
          return (
            <OpponentChip
              key={p.id}
              playerId={p.id}
              onClick={
                targetMode
                  ? () => onTargetClick?.(p.id)
                  : () => setExpandedId(p.id)
              }
              isActive={isActive}
              isThreat={isThreat}
              color={color}
              targetMode={!!targetMode}
              connected={p.connected}
            >
              {/* Header row: name + status + at-a-glance stats. */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <PlayerAvatar id={p.id} name={p.name} size="sm" />
                  <span className="font-semibold text-[var(--color-ink)]">{p.name}</span>
                  {isActive && (
                    <span className="rounded-full bg-[var(--color-accent-tint)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--color-accent-deep)]">
                      their turn
                    </span>
                  )}
                  {!p.connected && (
                    <span className="rounded-full bg-[var(--color-tint)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--color-ink-soft)]">
                      offline
                    </span>
                  )}
                  {isThreat && (
                    <span
                      className="rounded-full bg-[var(--color-accent)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.16em] text-white"
                      title={`${p.name} has 2 of 3 sets — break one or they win`}
                      data-testid={`threat-badge-${p.id}`}
                    >
                      1 from winning
                    </span>
                  )}
                  <SetProgress count={completedSets} highlight />
                </div>
                <div className="flex items-center gap-2 text-xs text-[var(--color-ink-soft)]">
                  <span className="flex items-center gap-1">
                    <span aria-hidden>🂠</span>
                    <span className="tabular font-semibold" data-hand-count={p.id}>
                      {p.handCount}
                    </span>
                  </span>
                  <span className="tabular font-semibold">${bankTotal}M</span>
                </div>
              </div>

              {/* Mobile: compact set chips. Tap card to expand. */}
              <div className="flex flex-wrap gap-1 sm:hidden">
                {p.propertySets.length === 0 ? (
                  <span className="text-[10px] text-[var(--color-ink-faint)]">no properties</span>
                ) : (
                  p.propertySets.map((g, gi) => (
                    <SetChip key={`${g.color}-${gi}`} color={g.color} count={g.cardIds.length} hasHouse={g.hasHouse} hasHotel={g.hasHotel} />
                  ))
                )}
                {p.propertySets.length > 0 && (
                  <span className="text-[10px] text-[var(--color-ink-faint)]">tap to view</span>
                )}
              </div>

              {/* Desktop: full property view with property cards. */}
              <div className="hidden sm:block">
                <div className="flex items-center gap-2 text-xs text-[var(--color-ink-soft)]">
                  <CardBack size="sm" count={p.handCount} />
                  <span className="tabular font-semibold">${bankTotal}M</span>
                </div>
                <div className="mt-2">
                  <PropertySetsView
                    propertySets={p.propertySets}
                    compact
                    onCardClick={undefined}
                    flashingCardIds={flashingCardIds}
                    playerId={p.id}
                  />
                </div>
              </div>
            </OpponentChip>
          );
        })}
      </div>

      {/* Mobile-only: bottom sheet showing the expanded opponent's full state */}
      {expandedId && (
        <OpponentDetailSheet
          opponent={opponents.find((p) => p.id === expandedId)!}
          onClose={() => setExpandedId(null)}
          flashingCardIds={flashingCardIds}
        />
      )}
    </>
  );
}

// Outer wrapper combining a useDroppable target (so action cards can be
// dragged onto the opponent for targeted plays) with the same button-shaped
// chip styling. Falls back to plain button when not on the active player's
// turn so the drop zone doesn't disturb spectator interactions.
function OpponentChip({
  playerId,
  onClick,
  isActive,
  isThreat,
  color,
  targetMode,
  connected,
  children,
}: {
  playerId: string;
  onClick?: () => void;
  isActive: boolean;
  isThreat: boolean;
  color: { border: string; bg: string };
  targetMode: boolean;
  connected: boolean;
  children: React.ReactNode;
}) {
  const { isOver, setNodeRef } = useDroppable({
    id: `opponent-${playerId}`,
    data: { kind: "opponent", opponentId: playerId },
  });
  return (
    <button
      ref={setNodeRef}
      onClick={onClick}
      data-testid={`opponent-${playerId}`}
      data-player-id={playerId}
      data-player-chip={playerId}
      className={[
        "surface-paper relative flex flex-col gap-2 overflow-hidden rounded-2xl p-2.5 text-left transition-colors",
        "w-full sm:w-fit sm:min-w-[180px]",
        isActive
          ? "ring-2 ring-[var(--color-accent)]"
          : isThreat
            ? "rr-threat-glow"
            : "",
        targetMode
          ? "cursor-pointer hover:bg-[var(--color-accent-tint)]"
          : "cursor-pointer hover:bg-[var(--color-tint)] sm:cursor-default",
        isOver ? "ring-2 ring-[var(--color-accent)]" : "",
        !connected ? "opacity-50" : "",
      ].join(" ")}
    >
      {/* Active turn red left bar */}
      {isActive && (
        <span
          aria-hidden
          className="absolute inset-y-0 left-0 w-1 bg-[var(--color-accent)]"
        />
      )}
      {children}
    </button>
  );
}

// Tiny chip showing a color group's status. Used on mobile where a full
// PropertySetsView would dominate vertical space.
function SetChip({
  color,
  count,
  hasHouse,
  hasHotel,
}: {
  color: SetColor;
  count: number;
  hasHouse: boolean;
  hasHotel: boolean;
}) {
  const complete = count >= SET_DEFS[color].complete;
  return (
    <span
      className={[
        "inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] text-[var(--color-ink)]",
        complete
          ? "border-[var(--color-accent)]/55 bg-[var(--color-accent-tint)]"
          : "border-[var(--color-ink)]/15 bg-[var(--color-card)]",
      ].join(" ")}
      style={{
        borderLeftWidth: 6,
        borderLeftColor: `var(--color-set-${color.replace(/([A-Z])/g, "-$1").toLowerCase()})`,
      }}
      title={`${color} ${count}/${SET_DEFS[color].complete}${hasHouse ? " · house" : ""}${hasHotel ? " · hotel" : ""}`}
    >
      <span className="capitalize font-medium">{color}</span>
      <span className="tabular font-semibold text-[var(--color-ink-soft)]">
        {count}/{SET_DEFS[color].complete}
      </span>
      {hasHouse && <span aria-hidden>🏠</span>}
      {hasHotel && <span aria-hidden>🏨</span>}
    </span>
  );
}

// Bottom sheet shown when a mobile player taps an opponent chip. Surfaces the
// full properties and bank so they can plan a Sly Deal / Forced Deal / Deal
// Breaker without scrolling away from the main play area.
function OpponentDetailSheet({
  opponent,
  onClose,
  flashingCardIds,
}: {
  opponent: ProjectedPlayer;
  onClose: () => void;
  flashingCardIds?: Set<string>;
}) {
  const bankTotal = opponent.bank.reduce((s, cid) => s + bankValueOf(cardById(cid)), 0);
  return (
    <div
      className="fixed inset-0 z-40 flex flex-col justify-end bg-[var(--color-ink)]/45 backdrop-blur-sm sm:items-center sm:justify-center sm:p-8"
      role="dialog"
      aria-modal="true"
      aria-label={`${opponent.name} details`}
      onClick={onClose}
    >
      <div
        className="surface-paper max-h-[80vh] w-full overflow-y-auto rounded-t-3xl p-5 sm:max-w-2xl sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-display text-xl font-semibold text-[var(--color-ink)]">{opponent.name}</h3>
            <SetProgress count={distinctCompletedSets(opponent)} highlight />
          </div>
          <button
            onClick={onClose}
            className="rounded-full px-3 py-1 text-sm font-semibold text-[var(--color-ink-soft)] transition hover:bg-[var(--color-tint)] hover:text-[var(--color-ink)]"
          >
            Close
          </button>
        </div>
        <div className="mb-3 text-xs text-[var(--color-ink-soft)]">
          🂠 {opponent.handCount} cards in hand · Bank ${bankTotal}M
        </div>
        <section className="mb-3">
          <h4 className="mb-1 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-ink-soft)]">Properties</h4>
          {opponent.propertySets.length === 0 ? (
            <div className="text-xs text-[var(--color-ink-faint)]">no properties</div>
          ) : (
            <PropertySetsView propertySets={opponent.propertySets} compact flashingCardIds={flashingCardIds} playerId={opponent.id} />
          )}
        </section>
        {opponent.bank.length > 0 && (
          <section>
            <h4 className="mb-1 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-ink-soft)]">Bank</h4>
            <div className="flex flex-wrap gap-1">
              {opponent.bank.map((cid) => (
                <Card key={cid} cardId={cid} size="sm" animated={false} />
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

