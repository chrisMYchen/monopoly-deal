"use client";

import { useEffect, useState } from "react";

import { Card } from "./Card";
import {
  ACTION_DESCRIPTIONS,
  ALL_COLORS,
  SET_DEFS,
  STANDARD_COLORS,
  bankValueOf,
  cardById,
  type ActionKind,
  type CardId,
  type SetColor,
} from "@/engine/cards";
import type { ProjectedGameState, ProjectedPlayer } from "@/engine/project";
import type { DeclaredAction } from "@/engine/state";
import { isComplete } from "@/engine/reduce";

// A reusable modal frame.
function Modal({
  title,
  children,
  onCancel,
  testId,
}: {
  title: string;
  children: React.ReactNode;
  onCancel?: () => void;
  testId?: string;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      data-testid={testId}
    >
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-white/15 bg-zinc-900 p-4 shadow-2xl">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-lg font-semibold">{title}</h3>
          {onCancel && (
            <button
              onClick={onCancel}
              className="rounded px-2 py-1 text-sm opacity-70 hover:bg-white/10 hover:opacity-100"
              data-testid="dialog-cancel"
            >
              Cancel
            </button>
          )}
        </div>
        {children}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PlayerPicker — pick an opponent
// ---------------------------------------------------------------------------

export function PlayerPicker({
  title,
  opponents,
  onPick,
  onCancel,
}: {
  title: string;
  opponents: ProjectedPlayer[];
  onPick: (playerId: string) => void;
  onCancel: () => void;
}) {
  return (
    <Modal title={title} onCancel={onCancel} testId="player-picker">
      <div className="grid gap-2">
        {opponents.map((p) => (
          <button
            key={p.id}
            onClick={() => onPick(p.id)}
            className="flex items-center justify-between rounded border border-white/15 bg-white/5 p-3 text-left hover:bg-white/10"
            data-testid={`pick-player-${p.id}`}
          >
            <span className="font-semibold">{p.name}</span>
            <span className="text-xs opacity-60">{p.handCount} cards</span>
          </button>
        ))}
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// OpponentPropertyPicker — pick a card from a specific opponent's tableau,
// optionally constrained (e.g. exclude complete sets for Sly Deal).
// ---------------------------------------------------------------------------

export function OpponentPropertyPicker({
  title,
  opponent,
  predicate,
  onPick,
  onCancel,
}: {
  title: string;
  opponent: ProjectedPlayer;
  predicate: (groupIdx: number, cardId: CardId) => boolean;
  onPick: (cardId: CardId, color: SetColor, groupIdx: number) => void;
  onCancel: () => void;
}) {
  return (
    <Modal title={title} onCancel={onCancel} testId="opponent-property-picker">
      {opponent.tableau.length === 0 ? (
        <p className="text-sm opacity-60">{opponent.name} has no properties.</p>
      ) : (
        <div className="flex flex-wrap gap-3">
          {opponent.tableau.map((g, gi) =>
            g.cardIds.map((cid) => {
              const ok = predicate(gi, cid);
              return (
                <button
                  key={cid}
                  disabled={!ok}
                  onClick={() => onPick(cid, g.color, gi)}
                  className={[
                    "rounded p-1 transition",
                    ok ? "ring-2 ring-pink-400/60 hover:ring-pink-300" : "opacity-40",
                  ].join(" ")}
                  data-testid={`pick-card-${cid}`}
                >
                  <Card cardId={cid} size="sm" animated={false} />
                </button>
              );
            }),
          )}
        </div>
      )}
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// MyPropertyPicker — pick a card from your own tableau (Forced Deal source)
// ---------------------------------------------------------------------------

export function MyPropertyPicker({
  title,
  self,
  predicate,
  onPick,
  onCancel,
}: {
  title: string;
  self: ProjectedPlayer;
  predicate: (groupIdx: number, cardId: CardId) => boolean;
  onPick: (cardId: CardId, color: SetColor, groupIdx: number) => void;
  onCancel: () => void;
}) {
  return (
    <Modal title={title} onCancel={onCancel} testId="my-property-picker">
      {self.tableau.length === 0 ? (
        <p className="text-sm opacity-60">You have no properties to swap.</p>
      ) : (
        <div className="flex flex-wrap gap-3">
          {self.tableau.map((g, gi) =>
            g.cardIds.map((cid) => {
              const ok = predicate(gi, cid);
              return (
                <button
                  key={cid}
                  disabled={!ok}
                  onClick={() => onPick(cid, g.color, gi)}
                  className={[
                    "rounded p-1 transition",
                    ok ? "ring-2 ring-emerald-400/60 hover:ring-emerald-300" : "opacity-40",
                  ].join(" ")}
                >
                  <Card cardId={cid} size="sm" animated={false} />
                </button>
              );
            }),
          )}
        </div>
      )}
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// CompleteSetPicker — pick an opponent's complete group (Deal Breaker)
// ---------------------------------------------------------------------------

export function CompleteSetPicker({
  title,
  opponent,
  onPick,
  onCancel,
}: {
  title: string;
  opponent: ProjectedPlayer;
  onPick: (color: SetColor, groupIdx: number) => void;
  onCancel: () => void;
}) {
  const completeGroups = opponent.tableau
    .map((g, gi) => ({ g, gi }))
    .filter(({ g }) => isComplete(g));
  return (
    <Modal title={title} onCancel={onCancel} testId="complete-set-picker">
      {completeGroups.length === 0 ? (
        <p className="text-sm opacity-60">{opponent.name} has no complete sets.</p>
      ) : (
        <div className="grid gap-3">
          {completeGroups.map(({ g, gi }) => (
            <button
              key={`${g.color}-${gi}`}
              onClick={() => onPick(g.color, gi)}
              className="rounded border border-yellow-400/60 bg-yellow-400/10 p-2 text-left hover:bg-yellow-400/20"
              data-testid={`pick-set-${g.color}-${gi}`}
            >
              <div className="mb-1 text-sm font-semibold capitalize">{g.color} set</div>
              <div className="flex gap-1">
                {g.cardIds.map((cid) => (
                  <Card key={cid} cardId={cid} size="sm" />
                ))}
              </div>
            </button>
          ))}
        </div>
      )}
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// WildAssignPicker — pick which color a wild card should join
// ---------------------------------------------------------------------------

export function WildAssignPicker({
  title,
  subtitle,
  options,
  self,
  isRainbow,
  onPick,
  onCancel,
}: {
  title: string;
  subtitle?: string;
  options: SetColor[];
  // Self's tableau is used to highlight which colors already have a group
  // (more useful target) vs. starting fresh. For rainbow wilds, only
  // existing-group colors are actually valid (rule: must attach).
  self?: ProjectedPlayer;
  isRainbow?: boolean;
  onPick: (color: SetColor) => void;
  onCancel: () => void;
}) {
  const existingColors = new Set(
    (self?.tableau ?? []).filter((g) => g.cardIds.length > 0).map((g) => g.color),
  );
  // Compute "completes set" for each color so we can flag the strategic pick.
  function wouldCompleteSet(c: SetColor): boolean {
    const g = self?.tableau.find((g) => g.color === c);
    if (!g) return false;
    const def = SET_DEFS[c];
    return g.cardIds.length + 1 >= def.complete && g.cardIds.length < def.complete;
  }

  return (
    <Modal title={title} onCancel={onCancel} testId="wild-assign">
      {subtitle && <p className="mb-2 text-xs opacity-70">{subtitle}</p>}
      {isRainbow && (
        <p className="mb-2 text-xs opacity-70">
          Rainbow wilds must attach to a same-color group already in play.
          Highlighted colors are eligible.
        </p>
      )}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {options.map((c) => {
          const exists = existingColors.has(c);
          const eligible = isRainbow ? exists : true;
          const completes = eligible && wouldCompleteSet(c);
          return (
            <button
              key={c}
              onClick={() => eligible && onPick(c)}
              disabled={!eligible}
              data-testid={`pick-color-${c}`}
              title={
                isRainbow && !exists
                  ? "Rainbow can't stand alone — no group of this color yet."
                  : completes
                    ? "Completes this set!"
                    : exists
                      ? "Joins your existing group."
                      : "Starts a new group of this color."
              }
              className={[
                "relative rounded border px-3 py-3 text-sm font-semibold capitalize transition",
                completes
                  ? "border-emerald-300/70 bg-emerald-300/10 hover:bg-emerald-300/20"
                  : eligible
                    ? exists
                      ? "border-yellow-300/60 bg-yellow-300/5 hover:bg-yellow-300/15"
                      : "border-white/15 hover:bg-white/10"
                    : "cursor-not-allowed border-white/10 opacity-40",
              ].join(" ")}
              style={{
                borderTopWidth: 8,
                borderTopColor: `var(--color-set-${c.replace(/([A-Z])/g, "-$1").toLowerCase()})`,
              }}
            >
              {c}
              {completes ? (
                <span className="absolute right-1 top-1 rounded bg-emerald-300/40 px-1 text-[9px] font-mono uppercase tracking-widest">
                  ✨ completes
                </span>
              ) : exists ? (
                <span className="absolute right-1 top-1 rounded bg-yellow-300/30 px-1 text-[9px] font-mono uppercase tracking-widest">
                  group
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// RentColorPicker — for 2-color rent: pick which of the two colors to charge
// (or for ★ wild rent: pick from any color you own).
// ---------------------------------------------------------------------------

export function RentColorPicker({
  title,
  options,
  onPick,
  onCancel,
}: {
  title: string;
  options: SetColor[];
  onPick: (color: SetColor) => void;
  onCancel: () => void;
}) {
  return (
    <Modal title={title} onCancel={onCancel} testId="rent-color">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {options.map((c) => (
          <button
            key={c}
            onClick={() => onPick(c)}
            data-testid={`rent-color-${c}`}
            className="rounded border border-white/15 px-3 py-3 text-sm font-semibold capitalize hover:bg-white/10"
          >
            {c}
          </button>
        ))}
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// PaymentDialog — pick cards from your bank/tableau totaling >= owed (or all)
// ---------------------------------------------------------------------------

export function PaymentDialog({
  payer,
  amountOwed,
  reason,
  onSubmit,
}: {
  payer: ProjectedPlayer;
  amountOwed: number;
  reason?: string;
  onSubmit: (cardIds: CardId[]) => void;
}) {
  const [selected, setSelected] = useState<Set<CardId>>(new Set());

  const totalAssetCount = payer.bank.length + payer.tableau.reduce((s, g) => s + g.cardIds.length, 0);
  const offeredValue = Array.from(selected).reduce(
    (s, cid) => s + bankValueOf(cardById(cid)),
    0,
  );
  const allOffered = selected.size === totalAssetCount;
  const enough = offeredValue >= amountOwed;
  const canSubmit = totalAssetCount === 0 || enough || allOffered;

  function toggle(cid: CardId) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(cid)) next.delete(cid);
      else next.add(cid);
      return next;
    });
  }

  return (
    <Modal title={`You owe $${amountOwed}M`} testId="payment-dialog">
      {reason && (
        <p className="mb-2 text-xs uppercase tracking-widest opacity-60">{reason}</p>
      )}
      <p className="mb-3 text-sm opacity-80">
        Selected: <span className="font-mono">${offeredValue}M</span>
        {!enough && totalAssetCount > 0 && " (less than owed — must offer everything)"}
        {offeredValue > amountOwed && " (overpaying — no change given)"}
      </p>

      {/* Smart auto-cover: pick cheapest cards summing >= owed. Helps experienced players speed through payments and beginners by showing a sensible default. */}
      {totalAssetCount > 0 && (
        <div className="mb-3 flex gap-2">
          <button
            type="button"
            onClick={() => setSelected(autoCover(payer, amountOwed))}
            className="rounded border border-white/15 px-2 py-1 text-xs opacity-80 hover:bg-white/5"
            data-testid="payment-auto"
          >
            Auto-pay (cheapest)
          </button>
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="rounded border border-white/15 px-2 py-1 text-xs opacity-80 hover:bg-white/5"
          >
            Clear
          </button>
        </div>
      )}

      {payer.bank.length > 0 && (
        <section className="mb-3">
          <h4 className="mb-1 text-sm uppercase tracking-widest opacity-60">Bank</h4>
          <div className="flex flex-wrap gap-2">
            {payer.bank.map((cid) => (
              <Card
                key={cid}
                cardId={cid}
                size="sm"
                selected={selected.has(cid)}
                onClick={() => toggle(cid)}
                animated={false}
              />
            ))}
          </div>
        </section>
      )}

      {payer.tableau.length > 0 && (
        <section className="mb-3">
          <h4 className="mb-1 text-sm uppercase tracking-widest opacity-60">Tableau</h4>
          <div className="flex flex-wrap gap-2">
            {payer.tableau.flatMap((g) =>
              g.cardIds.map((cid) => (
                <Card
                  key={cid}
                  cardId={cid}
                  size="sm"
                  selected={selected.has(cid)}
                  onClick={() => toggle(cid)}
                  animated={false}
                />
              )),
            )}
          </div>
        </section>
      )}

      <button
        disabled={!canSubmit}
        onClick={() => onSubmit(Array.from(selected))}
        className="h-11 w-full rounded-md bg-white/90 px-4 font-semibold text-zinc-900 disabled:opacity-50"
        data-testid="payment-submit"
      >
        Pay {totalAssetCount === 0 ? "(nothing — debt forgiven)" : enough ? `$${offeredValue}M` : "everything"}
      </button>
    </Modal>
  );
}

// Greedy: smallest-value-first until we cover the debt. If total assets are
// less than owed, returns ALL assets (the must-offer-everything path).
function autoCover(payer: ProjectedPlayer, owed: number): Set<CardId> {
  const all: { id: CardId; value: number }[] = [
    ...payer.bank.map((id) => ({ id, value: bankValueOf(cardById(id)) })),
    ...payer.tableau.flatMap((g) => g.cardIds.map((id) => ({ id, value: bankValueOf(cardById(id)) }))),
  ];
  const total = all.reduce((s, c) => s + c.value, 0);
  if (total <= owed) return new Set(all.map((c) => c.id));
  // Sort cheapest-first; greedily add until covering. Cards with $0 value
  // (wilds) don't help reach the threshold — keep them at the end.
  const sorted = [...all].sort((a, b) => a.value - b.value);
  const picked: CardId[] = [];
  let sum = 0;
  for (const c of sorted) {
    if (sum >= owed) break;
    if (c.value === 0) continue;
    picked.push(c.id);
    sum += c.value;
  }
  return new Set(picked);
}

// ---------------------------------------------------------------------------
// JsnPrompt — defender chooses to play a Just Say No or pass
// ---------------------------------------------------------------------------

export function JsnPrompt({
  responderName,
  prompt,
  jsnInHand,
  jsnInventory,
  preview,
  chainDepth,
  onPlay,
  onPass,
}: {
  responderName: string;
  prompt: string;
  // The Counter card to play; null if the responder has none.
  jsnInHand: CardId | null;
  // How many Counter cards the responder currently holds (so they can plan).
  jsnInventory: number;
  // Optional richer preview (the card or amount at stake).
  preview?: { kind: "card"; cardId: CardId } | { kind: "amount"; amount: number };
  // How deep the JSN war is (0 = first response). Useful to convey escalation.
  chainDepth: number;
  onPlay: (cardId: CardId) => void;
  onPass: () => void;
}) {
  return (
    <Modal title={chainDepth === 0 ? "Just Say No?" : `Counter war · depth ${chainDepth}`} testId="jsn-prompt">
      <p className="mb-2 font-semibold">{responderName}, your call:</p>
      <p className="mb-3 text-sm opacity-80">{prompt}</p>
      {preview?.kind === "card" && (
        <div className="mb-3 flex items-center gap-3 rounded border border-white/10 bg-white/5 p-2">
          <Card cardId={preview.cardId} size="sm" animated={false} />
          <div className="text-xs opacity-80">
            <div className="font-semibold">At stake:</div>
            <div>This card transfers if you don't counter.</div>
          </div>
        </div>
      )}
      {preview?.kind === "amount" && (
        <div className="mb-3 rounded border border-white/10 bg-white/5 p-2 text-sm">
          <span className="font-semibold">At stake: </span>
          You'll owe <span className="font-mono">${preview.amount}M</span>.
          You can pay with money or properties.
        </div>
      )}
      <p className="mb-4 text-xs italic opacity-60">{ACTION_DESCRIPTIONS.justSayNo}</p>
      <div className="flex gap-2">
        <button
          onClick={() => jsnInHand && onPlay(jsnInHand)}
          disabled={!jsnInHand}
          title={jsnInHand ? `Cancel this action — ${jsnInventory - 1} Counter${jsnInventory - 1 === 1 ? "" : "s"} left after this` : "You don't have a Counter card"}
          className="h-11 flex-1 rounded-md bg-pink-500 px-4 font-semibold text-white disabled:opacity-40 disabled:cursor-not-allowed"
          data-testid="jsn-play"
        >
          {jsnInHand
            ? `Counter (${jsnInventory} in hand)`
            : "Counter (no card)"}
        </button>
        <button
          onClick={onPass}
          className="h-11 flex-1 rounded-md border border-white/30 px-4 font-semibold hover:bg-white/5"
          data-testid="jsn-pass"
        >
          Let it happen
        </button>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// SpectatorPendingOverlay — shown to non-active, non-defender players so they
// know WHAT is happening while someone else makes a decision. Without this the
// game appears to "freeze" on their screen.
// ---------------------------------------------------------------------------

export function SpectatorPendingOverlay({ state }: { state: ProjectedGameState }) {
  const p = state.pending;
  if (!p) return null;

  let title = "";
  let detail = "";

  if (p.kind === "awaitJustSayNo") {
    const responderId = p.responderIsActor ? p.declaration.sourceId : p.pendingDefenders[0]!;
    const responderName = nameOf(state, responderId);
    title =
      p.jsnStack.length > 0
        ? `Counter war (depth ${p.jsnStack.length}) — ${responderName} deciding`
        : `${responderName} is deciding…`;
    detail = describeDeclarationForSpectator(p.declaration, state);
  } else if (p.kind === "awaitPayment") {
    const payerName = nameOf(state, p.payerId);
    const payeeName = nameOf(state, p.payeeId);
    title = `${payerName} is paying ${payeeName} $${p.amountOwed}M`;
    detail = describeDeclarationForSpectator(p.declaration, state);
  } else if (p.kind === "awaitDiscardToLimit") {
    title = `${nameOf(state, p.playerId)} is discarding ${p.mustDiscard} card${p.mustDiscard === 1 ? "" : "s"}`;
    detail = "End-of-turn hand limit (max 7).";
  } else {
    return null;
  }

  return (
    <div
      className="pointer-events-none fixed left-1/2 top-20 z-40 -translate-x-1/2 rounded-md border border-yellow-300/40 bg-zinc-900/85 px-4 py-2 text-center shadow-xl backdrop-blur"
      role="status"
    >
      <div className="text-sm font-semibold">{title}</div>
      {detail && <div className="text-xs opacity-70">{detail}</div>}
    </div>
  );
}

function nameOf(state: ProjectedGameState, pid: string): string {
  return state.players.find((p) => p.id === pid)?.name ?? pid;
}

function describeDeclarationForSpectator(d: DeclaredAction, state: ProjectedGameState): string {
  switch (d.kind) {
    case "slyDeal":
      return `${nameOf(state, d.sourceId)} → Swipe a property from ${nameOf(state, d.targetId)}`;
    case "forcedDeal":
      return `${nameOf(state, d.sourceId)} → Tribute swap with ${nameOf(state, d.targetId)}`;
    case "dealBreaker":
      return `${nameOf(state, d.sourceId)} → Hostile Takeover ${nameOf(state, d.targetId)}'s ${d.targetColor} set`;
    case "debtCollector":
      return `${nameOf(state, d.sourceId)} → Eviction on ${nameOf(state, d.targetId)} ($5M)`;
    case "birthday":
      return `${nameOf(state, d.sourceId)} → Tip Jar ($2M from everyone)`;
    case "rent":
      return `${nameOf(state, d.sourceId)} → Rent on ${d.color}${d.multiplier > 1 ? ` ×${d.multiplier}` : ""}`;
  }
}

// ---------------------------------------------------------------------------
// DiscardToLimitDialog — end-of-turn forced discard
// ---------------------------------------------------------------------------

export function DiscardToLimitDialog({
  hand,
  mustDiscard,
  onSubmit,
}: {
  hand: CardId[];
  mustDiscard: number;
  onSubmit: (cardIds: CardId[]) => void;
}) {
  const [selected, setSelected] = useState<Set<CardId>>(new Set());

  function toggle(cid: CardId) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(cid)) next.delete(cid);
      else next.add(cid);
      return next;
    });
  }
  const can = selected.size === mustDiscard;

  return (
    <Modal title={`Discard ${mustDiscard} cards`} testId="discard-dialog">
      <div className="mb-3 flex flex-wrap gap-2">
        {hand.map((cid) => (
          <Card
            key={cid}
            cardId={cid}
            size="sm"
            selected={selected.has(cid)}
            onClick={() => toggle(cid)}
            animated={false}
          />
        ))}
      </div>
      <button
        disabled={!can}
        onClick={() => onSubmit(Array.from(selected))}
        className="h-11 w-full rounded-md bg-white/90 font-semibold text-zinc-900 disabled:opacity-50"
        data-testid="discard-submit"
      >
        Discard
      </button>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// HouseHotelTargetPicker — pick a complete standard-color set (your own)
// ---------------------------------------------------------------------------

export function HouseHotelTargetPicker({
  title,
  self,
  needsHouse,
  onPick,
  onCancel,
}: {
  title: string;
  self: ProjectedPlayer;
  needsHouse?: boolean; // hotels require existing house
  onPick: (color: SetColor) => void;
  onCancel: () => void;
}) {
  const candidates = self.tableau.filter((g) => {
    if (!STANDARD_COLORS.includes(g.color)) return false;
    if (g.cardIds.length < 5) {
      // We don't know the exact complete count here without cards.ts; defer to engine.
    }
    if (needsHouse) return g.hasHouse && !g.hasHotel;
    return !g.hasHouse;
  });
  return (
    <Modal title={title} onCancel={onCancel} testId="house-target">
      {candidates.length === 0 ? (
        <p className="text-sm opacity-60">No eligible sets.</p>
      ) : (
        <div className="grid gap-2">
          {candidates.map((g) => (
            <button
              key={g.color}
              onClick={() => onPick(g.color)}
              data-testid={`house-pick-${g.color}`}
              className="rounded border border-white/15 px-3 py-2 text-left capitalize hover:bg-white/10"
            >
              {g.color}
            </button>
          ))}
        </div>
      )}
    </Modal>
  );
}
