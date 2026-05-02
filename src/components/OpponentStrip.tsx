"use client";

import { useState } from "react";
import { useDroppable } from "@dnd-kit/core";

import { TableauView } from "./TableauView";
import { CardBack, Card } from "./Card";
import { PlayerAvatar } from "./PlayerAvatar";
import { SetProgress } from "./SetProgress";
import type { ProjectedPlayer } from "@/engine/project";
import { SET_DEFS, bankValueOf, cardById, type SetColor } from "@/engine/cards";
import { distinctCompletedSets } from "@/engine/selectors";
import { colorForPlayerId } from "@/lib/playerColor";

// On desktop we render a rich opponent block (full tableau visible). On mobile
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
}: {
  opponents: ProjectedPlayer[];
  currentTurnPlayerId: string;
  onTargetClick?: (playerId: string) => void;
  targetMode?: boolean;
}) {
  // Track which opponent (if any) the user has tapped to expand on mobile.
  // On desktop the full tableau is always visible so this is a no-op.
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
                  <span className="font-semibold">{p.name}</span>
                  {isActive && (
                    <span className="rounded bg-yellow-300/30 px-1.5 py-0.5 text-[10px] uppercase tracking-widest text-yellow-100">
                      their turn
                    </span>
                  )}
                  {!p.connected && (
                    <span className="rounded bg-red-500/30 px-1.5 py-0.5 text-[10px] uppercase tracking-widest text-red-100">
                      offline
                    </span>
                  )}
                  <SetProgress count={completedSets} highlight />
                </div>
                <div className="flex items-center gap-2 text-xs opacity-80">
                  <span className="flex items-center gap-1">
                    <span aria-hidden>🂠</span>
                    <span className="font-mono">{p.handCount}</span>
                  </span>
                  <span className="font-mono">${bankTotal}M</span>
                </div>
              </div>

              {/* Mobile: compact set chips. Tap card to expand. */}
              <div className="flex flex-wrap gap-1 sm:hidden">
                {p.tableau.length === 0 ? (
                  <span className="text-[10px] opacity-50">no properties</span>
                ) : (
                  p.tableau.map((g, gi) => (
                    <SetChip key={`${g.color}-${gi}`} color={g.color} count={g.cardIds.length} hasHouse={g.hasHouse} hasHotel={g.hasHotel} />
                  ))
                )}
                {p.tableau.length > 0 && (
                  <span className="text-[10px] opacity-50">tap to view</span>
                )}
              </div>

              {/* Desktop: full tableau view with property cards. */}
              <div className="hidden sm:block">
                <div className="flex items-center gap-2 text-xs opacity-80">
                  <CardBack size="sm" count={p.handCount} />
                  <span className="font-mono">${bankTotal}M</span>
                </div>
                <div className="mt-2">
                  <TableauView tableau={p.tableau} compact onCardClick={undefined} />
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
      className={[
        "flex flex-col gap-2 rounded-md border p-2 text-left transition",
        "w-full sm:w-fit sm:min-w-[180px]",
        isActive
          ? "border-yellow-300/70 bg-yellow-300/5"
          : isThreat
            ? "border-red-400/60 bg-white/5"
            : `${color.border} ${color.bg}`,
        targetMode
          ? "cursor-pointer hover:border-pink-300/70 hover:bg-pink-300/10"
          : "cursor-pointer hover:bg-white/5 sm:cursor-default",
        isOver ? "ring-2 ring-pink-400/80 ring-offset-2 ring-offset-zinc-900" : "",
        !connected ? "opacity-40" : "",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

// Tiny chip showing a color group's status. Used on mobile where a full
// TableauView would dominate vertical space.
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
        "inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px]",
        complete ? "border-yellow-300/60 bg-yellow-300/10" : "border-white/15",
      ].join(" ")}
      style={{
        borderLeftWidth: 6,
        borderLeftColor: `var(--color-set-${color.replace(/([A-Z])/g, "-$1").toLowerCase()})`,
      }}
      title={`${color} ${count}/${SET_DEFS[color].complete}${hasHouse ? " · house" : ""}${hasHotel ? " · hotel" : ""}`}
    >
      <span className="capitalize">{color}</span>
      <span className="font-mono opacity-70">
        {count}/{SET_DEFS[color].complete}
      </span>
      {hasHouse && <span aria-hidden>🏠</span>}
      {hasHotel && <span aria-hidden>🏨</span>}
    </span>
  );
}

// Bottom sheet shown when a mobile player taps an opponent chip. Surfaces the
// full tableau and bank so they can plan a Sly Deal / Forced Deal / Deal
// Breaker without scrolling away from the main play area.
function OpponentDetailSheet({
  opponent,
  onClose,
}: {
  opponent: ProjectedPlayer;
  onClose: () => void;
}) {
  const bankTotal = opponent.bank.reduce((s, cid) => s + bankValueOf(cardById(cid)), 0);
  return (
    <div
      className="fixed inset-0 z-40 flex flex-col justify-end bg-black/50 sm:items-center sm:justify-center sm:p-8"
      role="dialog"
      aria-modal="true"
      aria-label={`${opponent.name} details`}
      onClick={onClose}
    >
      <div
        className="max-h-[80vh] w-full overflow-y-auto rounded-t-xl border border-white/15 bg-zinc-900 p-4 shadow-2xl sm:max-w-2xl sm:rounded-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-semibold">{opponent.name}</h3>
            <SetProgress count={distinctCompletedSets(opponent)} highlight />
          </div>
          <button
            onClick={onClose}
            className="rounded px-2 py-1 text-sm opacity-70 hover:bg-white/10 hover:opacity-100"
          >
            Close
          </button>
        </div>
        <div className="mb-3 text-xs opacity-70">
          🂠 {opponent.handCount} cards in hand · Bank ${bankTotal}M
        </div>
        <section className="mb-3">
          <h4 className="mb-1 text-xs uppercase tracking-widest opacity-60">Tableau</h4>
          {opponent.tableau.length === 0 ? (
            <div className="text-xs opacity-50">no properties</div>
          ) : (
            <TableauView tableau={opponent.tableau} compact />
          )}
        </section>
        {opponent.bank.length > 0 && (
          <section>
            <h4 className="mb-1 text-xs uppercase tracking-widest opacity-60">Bank</h4>
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

