"use client";

import { cardById, type CardId, type SetColor } from "@/engine/cards";
import type { ProjectedGameState } from "@/engine/project";
import type { LogEntry, LogEvent } from "@/engine/state";

import { Card } from "../Card";
import { PlayerName } from "./PlayerName";
import { PropertyChip, SetColorChip } from "./PropertyChip";

// Single source of rendering truth for log entries. Three call sites:
// - RecentsRibbon (variant="ribbon"): one terse line, names truncated.
// - PlayLogSheet (variant="sheet"): full rich, mini cards inlined.
// - Dialogs (variant="dialog"): paper-card style above prompt body.
//
// Dispatch on `entry.event?.kind` for structured rendering; fall back to the
// raw message string for noise events without a dispatcher (gameStart, draw,
// playProperty, playMoney, reassignWild, discardToLimit, reshuffle, turnStart).

export type LogEntryRowVariant = "ribbon" | "sheet" | "dialog";

export function LogEntryRow({
  entry,
  state,
  selfId,
  variant,
}: {
  entry: LogEntry;
  state: ProjectedGameState;
  selfId?: string;
  variant: LogEntryRowVariant;
}) {
  // The legacy `swap` payload is the richest info we have about Forced Deals.
  // It can co-exist with `event.kind === "forcedDeal"`, in which case the swap
  // takes priority for rendering.
  if (entry.swap) {
    return <ForcedDealRow swap={entry.swap} state={state} selfId={selfId} variant={variant} />;
  }

  const ev = entry.event;
  if (!ev) {
    return <PlainRow message={entry.message} variant={variant} />;
  }

  switch (ev.kind) {
    case "slyDeal":
      return <SlyDealRow event={ev} state={state} selfId={selfId} variant={variant} />;
    case "forcedDeal":
      // Without a swap payload (rare — only the "plays Forced Deal" pre-resolution
      // entry), fall back to a declaration-style row.
      return <DeclarationRow verb="Forced Deal" event={ev} state={state} selfId={selfId} variant={variant} />;
    case "dealBreaker":
      return <DealBreakerRow event={ev} state={state} selfId={selfId} variant={variant} />;
    case "debtCollector":
      return <ChargeRow verb="Debt Collector" event={ev} state={state} selfId={selfId} variant={variant} />;
    case "birthday":
      return <BirthdayRow event={ev} state={state} selfId={selfId} variant={variant} />;
    case "rent":
      return <RentRow event={ev} state={state} selfId={selfId} variant={variant} />;
    case "justSayNo":
      return <JustSayNoRow event={ev} state={state} selfId={selfId} variant={variant} />;
    case "jsnCanceled":
      return <JsnCanceledRow event={ev} state={state} selfId={selfId} variant={variant} />;
    case "pay":
      return <PayRow event={ev} state={state} selfId={selfId} variant={variant} />;
    case "debtForgiven":
      return <DebtForgivenRow event={ev} state={state} selfId={selfId} variant={variant} />;
    case "setComplete":
      return <SetMilestoneRow event={ev} state={state} selfId={selfId} variant={variant} kind="complete" />;
    case "setBroken":
      return <SetMilestoneRow event={ev} state={state} selfId={selfId} variant={variant} kind="broken" />;
    case "house":
    case "hotel":
      return <BuildingRow event={ev} state={state} selfId={selfId} variant={variant} />;
    case "houseDetached":
    case "hotelDetached":
      return <BuildingDetachedRow event={ev} state={state} selfId={selfId} variant={variant} />;
    case "passGo":
      return <PassGoRow event={ev} state={state} selfId={selfId} variant={variant} />;
    case "win":
      return <WinRow event={ev} state={state} selfId={selfId} variant={variant} />;
    // Noise: fall through to plain message — useful in the sheet's "All" view.
    default:
      return <PlainRow message={entry.message} variant={variant} />;
  }
}

// ---------------------------------------------------------------------------
// Shared layout primitives
// ---------------------------------------------------------------------------

function rowClasses(variant: LogEntryRowVariant): string {
  switch (variant) {
    case "ribbon":
      return "flex items-center gap-1.5 truncate text-[12px] leading-tight";
    case "sheet":
      return "flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[13px] leading-snug";
    case "dialog":
      return "flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[13px] leading-snug";
  }
}

function PlainRow({ message, variant }: { message: string; variant: LogEntryRowVariant }) {
  return (
    <span
      className={[
        rowClasses(variant),
        variant === "ribbon" ? "opacity-80" : "opacity-75",
      ].join(" ")}
    >
      {message}
    </span>
  );
}

// Find which color group a card currently lives in across all players. Used
// to render correct property chips for slyDeal "stole" entries (where the
// engine emits cardId but not color, since the assigned color is an
// emergent property of which group it lives in post-transfer).
function findCardColor(state: ProjectedGameState, cardId: CardId): SetColor | null {
  for (const p of state.players) {
    for (const g of p.propertySets) {
      if (g.cardIds.includes(cardId)) return g.color;
    }
  }
  // Fallback: if the card is a non-wild property, its intrinsic set color is
  // a reasonable default.
  const c = cardById(cardId);
  if (c.kind === "property") return c.set;
  return null;
}

// ---------------------------------------------------------------------------
// Per-event renderers
// ---------------------------------------------------------------------------

function SlyDealRow({
  event,
  state,
  selfId,
  variant,
}: {
  event: LogEvent;
  state: ProjectedGameState;
  selfId?: string;
  variant: LogEntryRowVariant;
}) {
  // Two emit sites: (1) "plays Sly Deal" pre-JSN with cardId = action card,
  // (2) "stole a property" post-JSN with cardId = stolen property. Distinguish
  // by inspecting the card kind so we render the right thing without keeping
  // separate event kinds.
  const c = event.cardId ? cardById(event.cardId) : null;
  const isStolen = !!c && c.kind !== "action";
  const color = event.cardId && isStolen ? findCardColor(state, event.cardId) ?? event.color : null;

  return (
    <span className={rowClasses(variant)}>
      {event.actorId && <PlayerName id={event.actorId} state={state} selfId={selfId} />}
      <span className="opacity-70">{isStolen ? "stole" : "→ Sly Deal on"}</span>
      {!isStolen && event.targetId && <PlayerName id={event.targetId} state={state} selfId={selfId} />}
      {isStolen && event.cardId && color && (
        <PropertyChip cardId={event.cardId} color={color} size={variant === "ribbon" ? "xs" : "sm"} />
      )}
      {isStolen && event.targetId && (
        <>
          <span className="opacity-70">from</span>
          <PlayerName id={event.targetId} state={state} selfId={selfId} />
        </>
      )}
    </span>
  );
}

function ForcedDealRow({
  swap,
  state,
  selfId,
  variant,
}: {
  swap: NonNullable<LogEntry["swap"]>;
  state: ProjectedGameState;
  selfId?: string;
  variant: LogEntryRowVariant;
}) {
  const isTarget = selfId === swap.targetId;
  const isSource = selfId === swap.sourceId;
  // POV reframing: "you lost X, got Y" is far clearer than the neutral "Alice
  // gave X and took Y" when reading in a hurry.
  if (isTarget) {
    return (
      <span className={rowClasses(variant)}>
        <span className="opacity-70">You lost</span>
        <PropertyChip cardId={swap.tookCardId} color={swap.tookFromColor} size={variant === "ribbon" ? "xs" : "sm"} />
        <span aria-hidden className="opacity-50">→</span>
        <span className="opacity-70">got</span>
        <PropertyChip cardId={swap.gaveCardId} color={swap.gaveFromColor} size={variant === "ribbon" ? "xs" : "sm"} />
        {variant !== "ribbon" && (
          <>
            <span className="opacity-60">via</span>
            <PlayerName id={swap.sourceId} state={state} selfId={selfId} />
          </>
        )}
      </span>
    );
  }
  if (isSource && variant !== "ribbon") {
    return (
      <span className={rowClasses(variant)}>
        <span className="opacity-70">You took</span>
        <PropertyChip cardId={swap.tookCardId} color={swap.tookFromColor} size="sm" />
        <span className="opacity-70">from</span>
        <PlayerName id={swap.targetId} state={state} selfId={selfId} />
        <span className="opacity-50">↔</span>
        <span className="opacity-70">gave</span>
        <PropertyChip cardId={swap.gaveCardId} color={swap.gaveFromColor} size="sm" />
      </span>
    );
  }
  return (
    <span className={rowClasses(variant)}>
      <PlayerName id={swap.sourceId} state={state} selfId={selfId} />
      <span aria-hidden className="opacity-50">↔</span>
      <PlayerName id={swap.targetId} state={state} selfId={selfId} />
      <PropertyChip cardId={swap.gaveCardId} color={swap.gaveFromColor} size={variant === "ribbon" ? "xs" : "sm"} />
      <span aria-hidden className="opacity-50">↔</span>
      <PropertyChip cardId={swap.tookCardId} color={swap.tookFromColor} size={variant === "ribbon" ? "xs" : "sm"} />
    </span>
  );
}

function DealBreakerRow({
  event,
  state,
  selfId,
  variant,
}: {
  event: LogEvent;
  state: ProjectedGameState;
  selfId?: string;
  variant: LogEntryRowVariant;
}) {
  return (
    <span className={rowClasses(variant)}>
      {event.actorId && <PlayerName id={event.actorId} state={state} selfId={selfId} />}
      <span className="opacity-70">stole</span>
      {event.color && (
        <SetColorChip color={event.color} label="★ SET" size={variant === "ribbon" ? "xs" : "sm"} />
      )}
      <span className="opacity-70">from</span>
      {event.targetId && <PlayerName id={event.targetId} state={state} selfId={selfId} />}
    </span>
  );
}

function ChargeRow({
  verb,
  event,
  state,
  selfId,
  variant,
}: {
  verb: string;
  event: LogEvent;
  state: ProjectedGameState;
  selfId?: string;
  variant: LogEntryRowVariant;
}) {
  return (
    <span className={rowClasses(variant)}>
      {event.actorId && <PlayerName id={event.actorId} state={state} selfId={selfId} />}
      <span className="opacity-70">→ {verb}</span>
      {event.targetId && <PlayerName id={event.targetId} state={state} selfId={selfId} />}
      {event.amount != null && (
        <span className="font-mono text-[11px] opacity-90">${event.amount}M</span>
      )}
    </span>
  );
}

function BirthdayRow({
  event,
  state,
  selfId,
  variant,
}: {
  event: LogEvent;
  state: ProjectedGameState;
  selfId?: string;
  variant: LogEntryRowVariant;
}) {
  const targetCount = event.targetIds?.length ?? 0;
  return (
    <span className={rowClasses(variant)}>
      {event.actorId && <PlayerName id={event.actorId} state={state} selfId={selfId} />}
      <span className="opacity-70">→ Birthday</span>
      {event.amount != null && (
        <span className="font-mono text-[11px] opacity-90">${event.amount}M</span>
      )}
      <span className="opacity-60">× {targetCount} opponent{targetCount === 1 ? "" : "s"}</span>
    </span>
  );
}

function RentRow({
  event,
  state,
  selfId,
  variant,
}: {
  event: LogEvent;
  state: ProjectedGameState;
  selfId?: string;
  variant: LogEntryRowVariant;
}) {
  const targetCount = event.targetIds?.length ?? 0;
  return (
    <span className={rowClasses(variant)}>
      {event.actorId && <PlayerName id={event.actorId} state={state} selfId={selfId} />}
      <span className="opacity-70">→ Rent</span>
      {event.color && (
        <SetColorChip color={event.color} size={variant === "ribbon" ? "xs" : "sm"} />
      )}
      {event.amount != null && (
        <span className="font-mono text-[11px] opacity-90">${event.amount}M</span>
      )}
      {event.multiplier && event.multiplier > 1 && (
        <span className="rounded bg-amber-300/30 px-1 text-[10px] font-mono uppercase tracking-wider text-amber-100">
          ×{event.multiplier}
        </span>
      )}
      {targetCount > 1 && variant !== "ribbon" && (
        <span className="opacity-60">all opponents</span>
      )}
      {targetCount === 1 && event.targetIds?.[0] && variant !== "ribbon" && (
        <PlayerName id={event.targetIds[0]} state={state} selfId={selfId} />
      )}
    </span>
  );
}

function JustSayNoRow({
  event,
  state,
  selfId,
  variant,
}: {
  event: LogEvent;
  state: ProjectedGameState;
  selfId?: string;
  variant: LogEntryRowVariant;
}) {
  return (
    <span className={rowClasses(variant)}>
      {event.actorId && <PlayerName id={event.actorId} state={state} selfId={selfId} />}
      <span className="rounded bg-cyan-500/20 px-1 text-[10px] font-bold uppercase tracking-widest text-cyan-100">
        Just Say No
      </span>
    </span>
  );
}

function JsnCanceledRow({
  event,
  state,
  selfId,
  variant,
}: {
  event: LogEvent;
  state: ProjectedGameState;
  selfId?: string;
  variant: LogEntryRowVariant;
}) {
  return (
    <span className={rowClasses(variant)}>
      <span className="rounded bg-cyan-500/20 px-1 text-[10px] font-bold uppercase tracking-widest text-cyan-100">
        Canceled
      </span>
      {event.actorId && (
        <>
          <PlayerName id={event.actorId} state={state} selfId={selfId} />
          <span className="opacity-70">→</span>
        </>
      )}
      {event.targetId && <PlayerName id={event.targetId} state={state} selfId={selfId} />}
    </span>
  );
}

function PayRow({
  event,
  state,
  selfId,
  variant,
}: {
  event: LogEvent;
  state: ProjectedGameState;
  selfId?: string;
  variant: LogEntryRowVariant;
}) {
  // Cap the inline mini-card preview so it doesn't blow up the row in extreme
  // cases. Sheet shows up to 8; ribbon/dialog show up to 4.
  const maxCards = variant === "sheet" ? 8 : 4;
  const cardIds = event.cardIds ?? [];
  const visible = cardIds.slice(0, maxCards);
  const overflow = cardIds.length - visible.length;

  return (
    <span className={rowClasses(variant)}>
      {event.actorId && <PlayerName id={event.actorId} state={state} selfId={selfId} />}
      <span className="opacity-70">paid</span>
      {event.targetId && <PlayerName id={event.targetId} state={state} selfId={selfId} />}
      {event.amount != null && (
        <span className="font-mono text-[11px] opacity-90">${event.amount}M</span>
      )}
      {variant !== "ribbon" && visible.length > 0 && (
        <span className="ml-1 inline-flex flex-wrap items-center gap-1">
          {visible.map((cid) => (
            <Card key={cid} cardId={cid} size="sm" animated={false} />
          ))}
          {overflow > 0 && (
            <span className="text-[11px] opacity-70">+{overflow}</span>
          )}
        </span>
      )}
      {variant === "ribbon" && cardIds.length > 0 && (
        <span className="text-[11px] opacity-70">({cardIds.length})</span>
      )}
    </span>
  );
}

function DebtForgivenRow({
  event,
  state,
  selfId,
  variant,
}: {
  event: LogEvent;
  state: ProjectedGameState;
  selfId?: string;
  variant: LogEntryRowVariant;
}) {
  return (
    <span className={rowClasses(variant)}>
      {event.actorId && <PlayerName id={event.actorId} state={state} selfId={selfId} />}
      <span className="opacity-70">had nothing — debt forgiven</span>
    </span>
  );
}

function SetMilestoneRow({
  event,
  state,
  selfId,
  variant,
  kind,
}: {
  event: LogEvent;
  state: ProjectedGameState;
  selfId?: string;
  variant: LogEntryRowVariant;
  kind: "complete" | "broken";
}) {
  return (
    <span className={rowClasses(variant)}>
      {event.actorId && <PlayerName id={event.actorId} state={state} selfId={selfId} />}
      <span className="opacity-70">{kind === "complete" ? "completed" : "set broken:"}</span>
      {event.color && (
        <SetColorChip color={event.color} size={variant === "ribbon" ? "xs" : "sm"} />
      )}
      <span aria-hidden>{kind === "complete" ? "✨" : "💥"}</span>
    </span>
  );
}

function BuildingRow({
  event,
  state,
  selfId,
  variant,
}: {
  event: LogEvent;
  state: ProjectedGameState;
  selfId?: string;
  variant: LogEntryRowVariant;
}) {
  const isHotel = event.kind === "hotel";
  return (
    <span className={rowClasses(variant)}>
      {event.actorId && <PlayerName id={event.actorId} state={state} selfId={selfId} />}
      <span className="opacity-70">placed {isHotel ? "Hotel 🏨" : "House 🏠"} on</span>
      {event.color && (
        <SetColorChip color={event.color} size={variant === "ribbon" ? "xs" : "sm"} />
      )}
    </span>
  );
}

function BuildingDetachedRow({
  event,
  state,
  selfId,
  variant,
}: {
  event: LogEvent;
  state: ProjectedGameState;
  selfId?: string;
  variant: LogEntryRowVariant;
}) {
  const isHotel = event.kind === "hotelDetached";
  return (
    <span className={rowClasses(variant)}>
      {event.actorId && <PlayerName id={event.actorId} state={state} selfId={selfId} />}
      <span className="opacity-70 line-through decoration-2 decoration-amber-300/60">
        {isHotel ? "Hotel" : "House"}
      </span>
      <span className="opacity-70">detached from</span>
      {event.color && (
        <SetColorChip color={event.color} size={variant === "ribbon" ? "xs" : "sm"} />
      )}
    </span>
  );
}

function PassGoRow({
  event,
  state,
  selfId,
  variant,
}: {
  event: LogEvent;
  state: ProjectedGameState;
  selfId?: string;
  variant: LogEntryRowVariant;
}) {
  return (
    <span className={rowClasses(variant)}>
      {event.actorId && <PlayerName id={event.actorId} state={state} selfId={selfId} />}
      <span className="opacity-70">Pass Go +{event.count ?? 2}</span>
    </span>
  );
}

function WinRow({
  event,
  state,
  selfId,
  variant,
}: {
  event: LogEvent;
  state: ProjectedGameState;
  selfId?: string;
  variant: LogEntryRowVariant;
}) {
  return (
    <span className={rowClasses(variant)}>
      <span aria-hidden>🏆</span>
      {event.actorId && <PlayerName id={event.actorId} state={state} selfId={selfId} />}
      <span className="opacity-90 font-semibold">wins!</span>
    </span>
  );
}

function DeclarationRow({
  verb,
  event,
  state,
  selfId,
  variant,
}: {
  verb: string;
  event: LogEvent;
  state: ProjectedGameState;
  selfId?: string;
  variant: LogEntryRowVariant;
}) {
  return (
    <span className={rowClasses(variant)}>
      {event.actorId && <PlayerName id={event.actorId} state={state} selfId={selfId} />}
      <span className="opacity-70">→ {verb}</span>
      {event.targetId && (
        <>
          <span className="opacity-60">on</span>
          <PlayerName id={event.targetId} state={state} selfId={selfId} />
        </>
      )}
    </span>
  );
}
