"use client";

import { motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";

import { Button } from "./ui/Button";
import { Card } from "./Card";
import {
  ACTION_DESCRIPTIONS,
  ALL_COLORS,
  SET_DEFS,
  SET_LABEL,
  STANDARD_COLORS,
  bankValueOf,
  cardById,
  type ActionKind,
  type CardId,
  type SetColor,
} from "@/engine/cards";
import type { ProjectedGameState, ProjectedPlayer } from "@/engine/project";
import type { DeclaredAction, LogEntry } from "@/engine/state";
import { isComplete } from "@/engine/reduce";
import { completesSetForReceiver, paymentCompletesSets, suggestPayment } from "@/engine/payment";
import { distinctCompletedSets } from "@/engine/selectors";
import { playSfx } from "@/lib/animations/audio";
import { haptics } from "@/lib/animations/haptics";

import { lastMustShow } from "./log/logFilters";
import { LogEntryRow } from "./log/LogEntryRow";

// Compact "what triggered this dialog" surface, rendered above the existing
// dialog body so a defender deciding whether to JSN, or a payer about to
// hand over cards, sees a rich, color-coded record of the action they're
// responding to.
function TriggerEntryCard({
  entry,
  state,
  selfId,
}: {
  entry: LogEntry | null | undefined;
  state: ProjectedGameState;
  selfId?: string;
}) {
  if (!entry) return null;
  return (
    <div className="mb-3 rounded border border-[var(--color-ink)]/15 bg-[var(--color-tint)] px-2.5 py-2 text-[var(--color-ink)]">
      <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-ink-soft)]">
        Triggering action
      </div>
      <LogEntryRow entry={entry} state={state} selfId={selfId} variant="dialog" />
    </div>
  );
}

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
  // Modal entry is intentionally fast (80ms) and never gates input — buttons
  // inside accept clicks immediately on first frame. No exit animation either,
  // because deferring close on cancel would feel laggy.
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.08, ease: "linear" }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--color-felt)]/55 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      data-testid={testId}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.14, ease: [0.18, 0.9, 0.3, 1.05] }}
        className="surface-paper max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl p-5"
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="font-display text-xl font-semibold text-[var(--color-ink)]">
            {title}
          </h3>
          {onCancel && (
            <button
              onClick={onCancel}
              className="rounded-full px-3 py-1 text-sm font-semibold text-[var(--color-ink-soft)] transition hover:bg-[var(--color-tint)] hover:text-[var(--color-ink)]"
              data-testid="dialog-cancel"
            >
              Cancel
            </button>
          )}
        </div>
        {children}
      </motion.div>
    </motion.div>
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
            className="flex items-center justify-between rounded-xl border border-[var(--color-ink)]/15 bg-[var(--color-card)] p-3 text-left transition-colors hover:bg-[var(--color-tint)] hover:border-[var(--color-accent)]/40"
            data-testid={`pick-player-${p.id}`}
          >
            <span className="font-semibold text-[var(--color-ink)]">{p.name}</span>
            <span className="text-xs text-[var(--color-ink-soft)]">{p.handCount} cards</span>
          </button>
        ))}
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// OpponentPropertyPicker — pick a card from a specific opponent's properties,
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
      {opponent.propertySets.length === 0 ? (
        <p className="text-sm text-[var(--color-ink-soft)]">{opponent.name} has no properties.</p>
      ) : (
        <div className="flex flex-wrap gap-3">
          {opponent.propertySets.map((g, gi) =>
            g.cardIds.map((cid) => {
              const ok = predicate(gi, cid);
              return (
                <button
                  key={cid}
                  disabled={!ok}
                  onClick={() => onPick(cid, g.color, gi)}
                  className={[
                    "rounded p-1 transition",
                    ok ? "ring-2 ring-[var(--color-accent)]/55 hover:ring-[var(--color-accent)]" : "opacity-40",
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
// MyPropertyPicker — pick a card from your own properties (Forced Deal source)
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
      {self.propertySets.length === 0 ? (
        <p className="text-sm text-[var(--color-ink-soft)]">You have no properties to swap.</p>
      ) : (
        <div className="flex flex-wrap gap-3">
          {self.propertySets.map((g, gi) =>
            g.cardIds.map((cid) => {
              const ok = predicate(gi, cid);
              return (
                <button
                  key={cid}
                  disabled={!ok}
                  onClick={() => onPick(cid, g.color, gi)}
                  className={[
                    "rounded p-1 transition",
                    ok ? "ring-2 ring-[var(--color-success)]/60 hover:ring-[var(--color-success)]" : "opacity-40",
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
  const completeGroups = opponent.propertySets
    .map((g, gi) => ({ g, gi }))
    .filter(({ g }) => isComplete(g));
  return (
    <Modal title={title} onCancel={onCancel} testId="complete-set-picker">
      {completeGroups.length === 0 ? (
        <p className="text-sm text-[var(--color-ink-soft)]">{opponent.name} has no complete sets.</p>
      ) : (
        <div className="grid gap-3">
          {completeGroups.map(({ g, gi }) => (
            <button
              key={`${g.color}-${gi}`}
              onClick={() => onPick(g.color, gi)}
              className="rounded-xl border-2 border-[var(--color-accent)] bg-[var(--color-accent-tint)] p-3 text-left transition-colors hover:bg-[var(--color-accent)]/15"
              data-testid={`pick-set-${g.color}-${gi}`}
            >
              <div className="mb-1 text-sm font-semibold capitalize text-[var(--color-ink)]">{g.color} set</div>
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
  // Self's properties are used to highlight which colors already have a group
  // (more useful target) vs. starting fresh. For rainbow wilds, only
  // existing-group colors are actually valid (rule: must attach).
  self?: ProjectedPlayer;
  isRainbow?: boolean;
  onPick: (color: SetColor) => void;
  onCancel: () => void;
}) {
  const existingColors = new Set(
    (self?.propertySets ?? []).filter((g) => g.cardIds.length > 0).map((g) => g.color),
  );
  // Compute "completes set" for each color so we can flag the strategic pick.
  function wouldCompleteSet(c: SetColor): boolean {
    const g = self?.propertySets.find((g) => g.color === c);
    if (!g) return false;
    const def = SET_DEFS[c];
    return g.cardIds.length + 1 >= def.complete && g.cardIds.length < def.complete;
  }

  return (
    <Modal title={title} onCancel={onCancel} testId="wild-assign">
      {subtitle && <p className="mb-2 text-xs text-[var(--color-ink-soft)]">{subtitle}</p>}
      {isRainbow && (
        <p className="mb-2 text-xs text-[var(--color-ink-soft)]">
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
                "relative rounded-xl border px-3 py-3 text-sm font-semibold capitalize text-[var(--color-ink)] transition-colors",
                completes
                  ? "border-[var(--color-success)] bg-[var(--color-success)]/10 hover:bg-[var(--color-success)]/15"
                  : eligible
                    ? exists
                      ? "border-[var(--color-accent)]/55 bg-[var(--color-accent-tint)] hover:bg-[var(--color-accent)]/15"
                      : "border-[var(--color-ink)]/15 hover:bg-[var(--color-tint)]"
                    : "cursor-not-allowed border-[var(--color-ink)]/10 text-[var(--color-ink-faint)]",
              ].join(" ")}
              style={{
                borderTopWidth: 8,
                borderTopColor: `var(--color-set-${c.replace(/([A-Z])/g, "-$1").toLowerCase()})`,
              }}
            >
              {c}
              {completes ? (
                <span className="tabular absolute right-1 top-1 rounded-full bg-[var(--color-success)] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest text-white">
                  ✨ completes
                </span>
              ) : exists ? (
                <span className="tabular absolute right-1 top-1 rounded-full bg-[var(--color-tint)] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest text-[var(--color-ink-soft)]">
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
            className="rounded-xl border border-[var(--color-ink)]/15 bg-[var(--color-card)] px-3 py-3 text-sm font-semibold capitalize text-[var(--color-ink)] transition-colors hover:bg-[var(--color-tint)] hover:border-[var(--color-accent)]/40"
            style={{
              borderLeftWidth: 6,
              borderLeftColor: `var(--color-set-${c.replace(/([A-Z])/g, "-$1").toLowerCase()})`,
            }}
          >
            {c}
          </button>
        ))}
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// RentDoublePicker — final step before sending PLAY_RENT. Lets the active
// player stack 0/1/2 Double The Rent cards onto the rent demand. Each double
// adds 1 to the play cost and doubles the multiplier (×1 → ×2 → ×4).
//
// Engine already accepts `doubleRentCardIds: CardId[]` on PLAY_RENT; this
// dialog is purely an opt-in UI surface so the iconic ×4 hotel'd-set rent
// moment is reachable. Shown only when the player has at least one Double
// The Rent in hand AND ≥ 2 plays remaining (1 for the Rent + 1 for the
// double); the second double additionally gates on ≥ 3 plays remaining.
// ---------------------------------------------------------------------------

export function RentDoublePicker({
  doubleCardIds,
  baseRent,
  multiTarget,
  targetCount,
  playsRemaining,
  color,
  onConfirm,
  onCancel,
}: {
  doubleCardIds: CardId[]; // Double The Rent cards in the player's hand (max 2 used)
  baseRent: number; // computed from rentForGroup at the chosen color
  multiTarget: boolean; // 2-color rent charges all opponents; ★ wild charges one
  targetCount: number; // # opponents that will be charged (for the per-vs-total preview)
  playsRemaining: number;
  color: SetColor;
  onConfirm: (selectedDoubleIds: CardId[]) => void;
  onCancel: () => void;
}) {
  const usable = doubleCardIds.slice(0, 2);
  const [selectedIds, setSelectedIds] = useState<CardId[]>([]);

  const multiplier = 1 << selectedIds.length; // 1, 2, 4
  const playCost = 1 + selectedIds.length;
  const perTarget = baseRent * multiplier;
  const totalDue = perTarget * targetCount;

  const canSelectAnother = usable.length > selectedIds.length && playCost + 1 <= playsRemaining;

  function toggle(cid: CardId) {
    setSelectedIds((prev) => {
      if (prev.includes(cid)) return prev.filter((x) => x !== cid);
      // Adding: only allow if plays still cover the new cost.
      if (1 + prev.length + 1 > playsRemaining) return prev;
      return [...prev, cid];
    });
  }

  return (
    <Modal title="Multiply this rent?" onCancel={onCancel} testId="rent-double-picker">
      <p className="mb-3 text-xs text-[var(--color-ink-soft)]">
        Each Double The Rent stacks the demand and uses one extra play.
      </p>
      <div className="mb-3 rounded-xl border border-[var(--color-ink)]/15 bg-[var(--color-tint)] p-3">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-ink-soft)]">
            <span
              className="mr-2 inline-block h-2.5 w-2.5 rounded-full align-middle"
              style={{
                backgroundColor: `var(--color-set-${color.replace(/([A-Z])/g, "-$1").toLowerCase()})`,
              }}
              aria-hidden
            />
            <span className="capitalize">{color}</span> rent
          </span>
          <span className="tabular text-sm text-[var(--color-ink-soft)]">
            base ${baseRent}M{multiplier > 1 ? ` × ${multiplier}` : ""}
          </span>
        </div>
        <div className="mt-1 flex items-baseline gap-2">
          <span className="tabular font-display text-3xl font-bold text-[var(--color-ink)]">
            ${perTarget}M
          </span>
          {multiTarget && targetCount > 1 && (
            <span className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-ink-soft)]">
              per opponent · ${totalDue}M total
            </span>
          )}
          {!multiTarget && (
            <span className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-ink-soft)]">
              owed
            </span>
          )}
        </div>
        <div className="mt-2 text-[11px] text-[var(--color-ink-soft)]">
          Costs <span className="tabular font-semibold text-[var(--color-ink)]">{playCost}</span> of your{" "}
          <span className="tabular font-semibold text-[var(--color-ink)]">{playsRemaining}</span> plays
          {playCost === playsRemaining && playsRemaining > 1 ? " — ends your turn" : ""}.
        </div>
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        {usable.map((cid, i) => {
          const sel = selectedIds.includes(cid);
          // Disabled when not currently selected AND adding would exceed plays.
          const disabled = !sel && 1 + selectedIds.length + 1 > playsRemaining;
          return (
            <button
              key={cid}
              type="button"
              onClick={() => !disabled && toggle(cid)}
              disabled={disabled}
              data-testid={`rent-double-toggle-${i}`}
              className={[
                "rounded p-1 transition",
                sel
                  ? "ring-2 ring-[var(--color-accent)]"
                  : disabled
                    ? "opacity-40"
                    : "ring-1 ring-[var(--color-ink)]/15 hover:ring-[var(--color-accent)]/55",
              ].join(" ")}
              title={
                disabled
                  ? "Not enough plays remaining"
                  : sel
                    ? "Click to remove from rent stack"
                    : "Click to stack on this rent"
              }
            >
              <Card cardId={cid} size="sm" selected={sel} animated={false} />
            </button>
          );
        })}
        {usable.length === 0 && (
          <span className="text-xs text-[var(--color-ink-soft)]">No Double The Rent cards in hand.</span>
        )}
      </div>

      <div className="flex gap-2">
        <Button
          variant="primary"
          fullWidth
          onClick={() => onConfirm(selectedIds)}
          data-testid="rent-double-confirm"
        >
          {multiplier > 1
            ? `Charge ×${multiplier} ($${perTarget}M${multiTarget && targetCount > 1 ? "/each" : ""})`
            : `Charge $${perTarget}M${multiTarget && targetCount > 1 ? "/each" : ""}`}
        </Button>
        {selectedIds.length > 0 && (
          <Button
            variant="ghost"
            onClick={() => setSelectedIds([])}
            data-testid="rent-double-clear"
          >
            Clear
          </Button>
        )}
      </div>
      {canSelectAnother && selectedIds.length === 1 && (
        <p className="mt-2 text-[11px] text-[var(--color-ink-faint)]">
          Tip: stack a second Double for ×4 (uses {playCost + 1} plays).
        </p>
      )}
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// PaymentDialog — pick cards from your bank/properties totaling >= owed (or all)
// ---------------------------------------------------------------------------

// Kebab-case CSS var for a set color, e.g. lightBlue → --color-set-light-blue.
function setColorVar(color: SetColor): string {
  return `var(--color-set-${color.replace(/([A-Z])/g, "-$1").toLowerCase()})`;
}

// Compact "who you're paying" strip: the demander's set progress and bank
// total. All public information — the modal was just hiding the table.
function PayeeSummary({ payee }: { payee: ProjectedPlayer }) {
  const bankTotal = payee.bank.reduce((s, cid) => s + bankValueOf(cardById(cid)), 0);
  const completed = distinctCompletedSets(payee);
  return (
    <div
      className="mb-3 rounded border border-[var(--color-ink)]/15 bg-[var(--color-tint)] px-2.5 py-2"
      data-testid="payment-payee-summary"
    >
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-ink-soft)]">
          Paying {payee.name}
        </span>
        <span className="text-[11px] text-[var(--color-ink-soft)]">
          Bank <span className="tabular font-semibold text-[var(--color-ink)]">${bankTotal}M</span>
          {" · "}
          <span className={completed >= 2 ? "font-bold text-[var(--color-accent)]" : "font-semibold text-[var(--color-ink)]"}>
            {completed}/3 sets
          </span>
        </span>
      </div>
      {payee.propertySets.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {payee.propertySets.map((g) => {
            const complete = g.cardIds.length >= SET_DEFS[g.color].complete;
            return (
              <span
                key={g.color}
                className={`tabular rounded-full px-1.5 py-0.5 text-[10px] font-bold text-white ${complete ? "ring-2 ring-[var(--color-accent)]" : ""}`}
                style={{ backgroundColor: setColorVar(g.color) }}
                title={`${SET_LABEL[g.color]}: ${g.cardIds.length} of ${SET_DEFS[g.color].complete}${complete ? " — complete" : ""}`}
              >
                {g.cardIds.length}/{SET_DEFS[g.color].complete}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function PaymentDialog({
  payer,
  payee,
  amountOwed,
  reason,
  state,
  selfId,
  onSubmit,
}: {
  payer: ProjectedPlayer;
  // The demander. Used for the holdings summary and the danger badges on
  // property cards whose surrender would complete one of their sets.
  payee?: ProjectedPlayer;
  amountOwed: number;
  reason?: string;
  // For inline rendering of the triggering log entry above the prompt.
  state: ProjectedGameState;
  selfId?: string;
  onSubmit: (cardIds: CardId[]) => void;
}) {
  const suggestion = useMemo(
    () => suggestPayment(payer, amountOwed, payee),
    [payer, amountOwed, payee],
  );
  // Pre-fill with the suggested payment — identical to what the turn timer
  // would take on timeout, so confirming fast never does worse than stalling.
  const [selected, setSelected] = useState<Set<CardId>>(() => new Set(suggestion.cardIds));

  const totalAssetCount = payer.bank.length + payer.propertySets.reduce((s, g) => s + g.cardIds.length, 0);
  const offeredValue = Array.from(selected).reduce(
    (s, cid) => s + bankValueOf(cardById(cid)),
    0,
  );
  const allOffered = selected.size === totalAssetCount;
  const enough = offeredValue >= amountOwed;
  const overpay = Math.max(0, offeredValue - amountOwed);
  const canSubmit = totalAssetCount === 0 || enough || allOffered;

  function toggle(cid: CardId) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(cid)) next.delete(cid);
      else next.add(cid);
      return next;
    });
  }

  // Danger: this payment completes a set for the demander. The single
  // costliest beginner mistake in payment — surface it loudly. Per-card
  // badges catch the one-short case; the aggregate check catches batches
  // (two oranges paid to a 1/3 orange payee complete the set together even
  // though each card alone looks safe).
  const dangerColorFor = (cid: CardId): SetColor | null =>
    payee ? completesSetForReceiver(cardById(cid), payee) : null;
  const selectionDangers = payee ? paymentCompletesSets(Array.from(selected), payee) : [];
  const payeeCompleted = payee ? distinctCompletedSets(payee) : 0;

  // Stable sorted views. Bank ascending by value; loose-set groups before
  // complete groups so the safe cards come first.
  const bankSorted = [...payer.bank].sort(
    (a, b) => bankValueOf(cardById(a)) - bankValueOf(cardById(b)) || a.localeCompare(b),
  );
  const groupsSorted = [...payer.propertySets]
    .map((g) => ({ ...g, complete: isComplete(g) }))
    .sort((a, b) => Number(a.complete) - Number(b.complete));

  const triggerEntry = lastMustShow(state.log);
  return (
    <Modal title={`You owe $${amountOwed}M`} testId="payment-dialog">
      <TriggerEntryCard entry={triggerEntry} state={state} selfId={selfId} />
      {reason && (
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-ink-soft)]">
          {reason}
        </p>
      )}
      {payee && <PayeeSummary payee={payee} />}
      <p className="mb-3 text-sm text-[var(--color-ink-soft)]">
        Selected: <span className="tabular font-semibold text-[var(--color-ink)]">${offeredValue}M</span>
        {enough && overpay === 0 && (
          <span className="ml-1.5 font-semibold text-[var(--color-success)]">exact change</span>
        )}
        {overpay > 0 && (
          <span className="ml-1.5 font-semibold text-[var(--color-warning)]" data-testid="payment-overpay">
            overpaying ${overpay}M — no change given
          </span>
        )}
        {!enough && totalAssetCount > 0 && " — less than owed, so you must offer everything"}
      </p>
      {selectionDangers.length > 0 && (
        <p
          className="mb-3 text-sm font-semibold text-[var(--color-accent)]"
          data-testid="payment-danger-warning"
        >
          {selectionDangers.map((color) => (
            <span key={color} className="block">
              ⚠ This payment completes their {SET_LABEL[color]} set
              {payeeCompleted >= 2 ? " — that could win them the game!" : "."}
            </span>
          ))}
        </p>
      )}

      {totalAssetCount > 0 && (
        <div className="mb-3 flex gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setSelected(new Set(suggestion.cardIds))}
            data-testid="payment-auto"
          >
            Suggested payment
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setSelected(new Set())}
          >
            Clear
          </Button>
        </div>
      )}

      {bankSorted.length > 0 && (
        <section className="mb-3">
          <h4 className="mb-1 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-ink-soft)]">Bank</h4>
          <div className="flex flex-wrap gap-2">
            {bankSorted.map((cid) => (
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

      {groupsSorted.map((g) => (
        <section key={g.color} className="mb-3">
          <h4 className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-ink-soft)]">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ backgroundColor: setColorVar(g.color) }}
            />
            {SET_LABEL[g.color]}
            {g.complete && (
              <span className="font-bold text-[var(--color-accent)]">· complete set</span>
            )}
          </h4>
          <div className="flex flex-wrap gap-2">
            {g.cardIds.map((cid) => {
              const danger = dangerColorFor(cid);
              return (
                <div key={cid} className="relative">
                  <Card
                    cardId={cid}
                    size="sm"
                    selected={selected.has(cid)}
                    onClick={() => toggle(cid)}
                    animated={false}
                  />
                  {danger && (
                    <span
                      className="pointer-events-none absolute -right-1 -top-1 rounded-full bg-[var(--color-accent)] px-1 text-[9px] font-bold leading-4 text-white"
                      title={`Completes ${payee?.name}'s ${SET_LABEL[danger]} set`}
                      data-testid="payment-danger-badge"
                    >
                      ⚠
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ))}

      <Button
        variant="primary"
        size="lg"
        fullWidth
        disabled={!canSubmit}
        onClick={() => onSubmit(Array.from(selected))}
        data-testid="payment-submit"
      >
        Pay {totalAssetCount === 0 ? "(nothing — debt forgiven)" : enough ? `$${offeredValue}M` : "everything"}
      </Button>
    </Modal>
  );
}

// Short human label for a card being handed over ("Boardwalk", "$5M", "wild").
function describePaidCard(cid: CardId): string {
  const c = cardById(cid);
  switch (c.kind) {
    case "property":
      return c.name;
    case "money":
      return `$${c.value}M`;
    case "wild2":
    case "wild10":
      return "a wildcard";
    case "action":
      return `$${c.value}M`;
  }
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
  state,
  selfId,
  onPlay,
  onPass,
}: {
  responderName: string;
  prompt: string;
  // The Just Say No card to play; null if the responder has none.
  jsnInHand: CardId | null;
  // How many Just Say No cards the responder currently holds (so they can plan).
  jsnInventory: number;
  // Optional richer preview (the card / amount / set at stake). The `set`
  // variant is used for Deal Breaker, where the entire group is on the line —
  // showing the strip makes the "burn JSN now or kiss this set goodbye"
  // decision concrete.
  preview?:
    | { kind: "card"; cardId: CardId }
    | { kind: "amount"; amount: number }
    | { kind: "set"; cardIds: CardId[]; color: SetColor };
  // How deep the JSN war is (0 = first response). Useful to convey escalation.
  chainDepth: number;
  // For inline rendering of the triggering log entry — the most recent
  // must-show entry is the action the responder is being asked to cancel.
  state: ProjectedGameState;
  selfId?: string;
  onPlay: (cardId: CardId) => void;
  onPass: () => void;
}) {
  const triggerEntry = lastMustShow(state.log);
  // Pull the live declaration so we can phrase the pass button in terms of
  // the actual consequence ("Pay $1M" beats "Let it happen" — the latter
  // reads as a shrug exactly when the player most needs concrete copy).
  const pendingJsn = state.pending?.kind === "awaitJustSayNo" ? state.pending : undefined;
  const declaration = pendingJsn?.declaration;
  // When the responder is the original actor (deciding whether to counter a
  // defender's JSN), the stakes invert: passing means their own action is
  // canceled — nothing transfers, nothing is owed. The at-stake previews and
  // "Pay $X" pass copy are all defender-framed, so they only render for
  // defenders.
  const responderIsActor = pendingJsn?.responderIsActor ?? false;
  const passLabel = passLabelForJsn(declaration, preview, responderIsActor);
  // What passing actually costs the defender, using the same solver as the
  // payment dialog — the JSN decision is only informed if you can see which
  // cards you'd hand over before the window closes.
  const responder = state.players.find((p) => p.id === selfId);
  const payeeForCost =
    declaration && "sourceId" in declaration
      ? state.players.find((p) => p.id === declaration.sourceId)
      : undefined;
  const passCost = useMemo(() => {
    if (responderIsActor || preview?.kind !== "amount" || !responder) return null;
    return suggestPayment(responder, preview.amount, payeeForCost);
  }, [responderIsActor, preview, responder, payeeForCost]);
  // Distinguish "found the payer, they own nothing" (debt truly forgiven)
  // from "couldn't resolve the payer" (don't claim anything about cost).
  const responderIsBroke =
    passCost != null && passCost.cardIds.length === 0 && passCost.total === 0;
  return (
    <Modal
      title={chainDepth === 0 ? "Just Say No?" : `Just Say No chain · depth ${chainDepth}`}
      testId="jsn-prompt"
    >
      <TriggerEntryCard entry={triggerEntry} state={state} selfId={selfId} />
      <p className="mb-2 font-semibold text-[var(--color-ink)]">{responderName}, your call:</p>
      <p className="mb-3 text-sm text-[var(--color-ink-soft)]">{prompt}</p>
      {responderIsActor && (
        <div className="mb-3 rounded-xl border border-[var(--color-ink)]/15 bg-[var(--color-tint)] p-3 text-sm text-[var(--color-ink-soft)]">
          <span className="font-semibold text-[var(--color-ink)]">At stake: </span>
          They said No. Counter with your own Just Say No to force the action
          through, or accept — your card is spent either way.
        </div>
      )}
      {!responderIsActor && preview?.kind === "card" && (
        <div className="mb-3 flex items-center gap-3 rounded-xl border border-[var(--color-ink)]/15 bg-[var(--color-tint)] p-3">
          <Card cardId={preview.cardId} size="sm" animated={false} />
          <div className="text-xs text-[var(--color-ink-soft)]">
            <div className="font-semibold text-[var(--color-ink)]">At stake:</div>
            <div>This card transfers if you don't Just Say No.</div>
          </div>
        </div>
      )}
      {!responderIsActor && preview?.kind === "amount" && (
        <div className="mb-3 rounded-xl border border-[var(--color-ink)]/15 bg-[var(--color-tint)] p-3 text-sm text-[var(--color-ink-soft)]">
          <span className="font-semibold text-[var(--color-ink)]">At stake: </span>
          You'll owe <span className="tabular font-semibold text-[var(--color-ink)]">${preview.amount}M</span>.
          {passCost && passCost.cardIds.length > 0 ? (
            <div className="mt-2" data-testid="jsn-pass-cost">
              <div className="mb-1 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-ink-soft)]">
                Passing would hand over (suggested)
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {passCost.cardIds.map((cid) => (
                  <Card key={cid} cardId={cid} size="sm" animated={false} />
                ))}
              </div>
              {passCost.shortfall > 0 && (
                <div className="mt-1.5 text-xs font-semibold text-[var(--color-warning)]">
                  Everything you own — ${passCost.shortfall}M of the debt is forgiven.
                </div>
              )}
              {passCost.breaksCompleteSet && (
                <div className="mt-1.5 text-xs font-semibold text-[var(--color-accent)]">
                  ⚠ Covering this breaks one of your complete sets.
                </div>
              )}
              {passCost.usesProperties && !passCost.breaksCompleteSet && (
                <div className="mt-1.5 text-xs font-semibold text-[var(--color-warning)]">
                  Your bank can't cover it — properties leave the table.
                </div>
              )}
            </div>
          ) : responderIsBroke ? (
            <div className="mt-1.5 text-xs font-semibold text-[var(--color-ink)]">
              You have nothing to pay with — the debt would be forgiven.
            </div>
          ) : (
            <div className="mt-1.5 text-xs text-[var(--color-ink-soft)]">
              You'll choose which cards to pay with.
            </div>
          )}
        </div>
      )}
      {!responderIsActor && preview?.kind === "set" && (
        <div
          className="mb-3 rounded-xl border-2 border-[var(--color-accent)] bg-[var(--color-accent-tint)] p-3"
          data-testid="jsn-preview-set"
          style={{
            borderTopWidth: 8,
            borderTopColor: `var(--color-set-${preview.color.replace(/([A-Z])/g, "-$1").toLowerCase()})`,
          }}
        >
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-[var(--color-ink)]">
              At stake — entire <span className="capitalize">{preview.color}</span> set
            </span>
            <span className="rounded-full bg-[var(--color-accent)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.18em] text-white">
              Deal breaker
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {preview.cardIds.map((cid) => (
              <Card key={cid} cardId={cid} size="sm" animated={false} />
            ))}
          </div>
        </div>
      )}
      {jsnInHand && (
        <p className="mb-4 text-xs text-[var(--color-ink-faint)]">{ACTION_DESCRIPTIONS.justSayNo}</p>
      )}
      <div className="flex gap-2">
        {jsnInHand ? (
          <>
            <Button
              variant="primary"
              fullWidth
              onClick={() => onPlay(jsnInHand)}
              title={`Cancel this action — ${jsnInventory - 1} Just Say No${jsnInventory - 1 === 1 ? "" : "s"} left after this`}
              data-testid="jsn-play"
            >
              Just Say No
              <span className="ml-2 rounded-full bg-white/20 px-1.5 py-0.5 text-[10px] font-semibold">
                {jsnInventory} in hand
              </span>
            </Button>
            <Button
              variant="secondary"
              fullWidth
              onClick={onPass}
              data-testid="jsn-pass"
            >
              {passLabel}
            </Button>
          </>
        ) : (
          // No Just Say No in hand → only one real choice. Promote it to a
          // single primary CTA labeled with the actual consequence so the
          // player isn't staring at a disabled button as visual debris.
          <Button
            variant="primary"
            fullWidth
            onClick={onPass}
            data-testid="jsn-pass"
          >
            {passLabel}
          </Button>
        )}
      </div>
    </Modal>
  );
}

function passLabelForJsn(
  declaration: DeclaredAction | undefined,
  preview:
    | { kind: "card"; cardId: CardId }
    | { kind: "amount"; amount: number }
    | { kind: "set"; cardIds: CardId[]; color: SetColor }
    | undefined,
  responderIsActor: boolean,
): string {
  // The actor passing accepts the defender's JSN: their action fizzles.
  if (responderIsActor) return "Accept the No";
  if (preview?.kind === "amount") return `Pay $${preview.amount}M`;
  if (declaration?.kind === "slyDeal") return "Allow steal";
  if (declaration?.kind === "forcedDeal") return "Allow swap";
  if (declaration?.kind === "dealBreaker") return "Allow set break";
  return "Continue";
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
        ? `Just Say No chain (depth ${p.jsnStack.length}) — ${responderName} deciding`
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

  const triggerEntry = lastMustShow(state.log);
  return (
    <div
      className="surface-inked pointer-events-none fixed left-1/2 top-20 z-40 -translate-x-1/2 rounded-2xl px-4 py-2 text-center"
      role="status"
    >
      <div className="text-sm font-semibold text-[var(--color-ink-on-dark)]">{title}</div>
      {detail && <div className="text-xs text-[var(--color-ink-on-dark)]/70">{detail}</div>}
      {triggerEntry && (
        <div className="pointer-events-none mt-2 flex justify-center text-left text-[var(--color-ink-on-dark)]/90">
          <LogEntryRow
            entry={triggerEntry}
            state={state}
            selfId={state.selfId}
            variant="dialog"
          />
        </div>
      )}
    </div>
  );
}

function nameOf(state: ProjectedGameState, pid: string): string {
  return state.players.find((p) => p.id === pid)?.name ?? pid;
}

function describeDeclarationForSpectator(d: DeclaredAction, state: ProjectedGameState): string {
  switch (d.kind) {
    case "slyDeal":
      return `${nameOf(state, d.sourceId)} → Sly Deal from ${nameOf(state, d.targetId)}`;
    case "forcedDeal":
      return `${nameOf(state, d.sourceId)} → Forced Deal with ${nameOf(state, d.targetId)}`;
    case "dealBreaker":
      return `${nameOf(state, d.sourceId)} → Deal Breaker on ${nameOf(state, d.targetId)}'s ${d.targetColor} set`;
    case "debtCollector":
      return `${nameOf(state, d.sourceId)} → Debt Collector on ${nameOf(state, d.targetId)} ($5M)`;
    case "birthday":
      return `${nameOf(state, d.sourceId)} → It's My Birthday ($2M from everyone)`;
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

  // Gentle acknowledgment when the prompt opens — soft two-note cue + tap
  // haptic. "You have a thing to do," not "you screwed up." See DESIGN.md
  // motion codex (Hand overflow event). May double-fire on a WS reconnect that
  // unmounts/remounts the dialog with the same pending state; tracked as TODO.
  useEffect(() => {
    playSfx("handOverflow", 0.8);
    haptics.tap();
  }, []);

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
    <Modal title="End of turn — keep 7" testId="discard-dialog">
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
      <Button
        variant="primary"
        size="lg"
        fullWidth
        disabled={!can}
        onClick={() => onSubmit(Array.from(selected))}
        data-testid="discard-submit"
      >
        Discard
      </Button>
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
  // Filter to only complete standard-color sets the engine would actually
  // accept. RR/Util are excluded; sets must be complete (cardIds.length >=
  // SET_DEFS[color].complete, which can overcomplete after a Deal Breaker
  // stacks groups, but the comparison still holds). Hotels additionally
  // require an existing house and no hotel yet; houses require no house yet.
  const candidates = self.propertySets.filter((g) => {
    if (!STANDARD_COLORS.includes(g.color)) return false;
    if (g.cardIds.length < SET_DEFS[g.color].complete) return false;
    if (needsHouse) return g.hasHouse && !g.hasHotel;
    return !g.hasHouse;
  });
  return (
    <Modal title={title} onCancel={onCancel} testId="house-target">
      {candidates.length === 0 ? (
        <p className="text-sm text-[var(--color-ink-soft)]">
          {needsHouse
            ? "No complete set with a house and no hotel yet."
            : "No complete standard-color set without a house yet."}
        </p>
      ) : (
        <div className="grid gap-2">
          {candidates.map((g, idx) => (
            <button
              key={`${g.color}-${idx}`}
              onClick={() => onPick(g.color)}
              data-testid={`house-pick-${g.color}`}
              className="rounded-xl border border-[var(--color-ink)]/15 bg-[var(--color-card)] px-3 py-2 text-left font-semibold capitalize text-[var(--color-ink)] transition-colors hover:bg-[var(--color-tint)] hover:border-[var(--color-accent)]/40"
              style={{
                borderLeftWidth: 6,
                borderLeftColor: `var(--color-set-${g.color.replace(/([A-Z])/g, "-$1").toLowerCase()})`,
              }}
            >
              {g.color}
            </button>
          ))}
        </div>
      )}
    </Modal>
  );
}
