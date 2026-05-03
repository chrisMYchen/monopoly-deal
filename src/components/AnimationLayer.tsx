"use client";

// Top-level animation overlay + dispatcher. Subscribes to the game log via
// useGameEvents, fires sound + haptic + visual effects per event kind, and
// renders short-lived overlays (BigNumber, ShieldClash, RentDemand, etc).
//
// Cardinal rule: pointer-events:none everywhere. State updates apply
// instantly; this layer is decoration only. If events arrive faster than
// the dispatcher can render, we drop or compress — never block input.

import { AnimatePresence } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useGame } from "@/lib/gameStore";
import {
  attachConfettiCanvas,
  burstFromRect,
  winRoll,
} from "@/lib/animations/confetti";
import { attachAudioUnlock, playSfx } from "@/lib/animations/audio";
import { haptics } from "@/lib/animations/haptics";
import { useGameEvents } from "@/lib/animations/useGameDiff";
import type { LogEntry, LogEvent, PlayerId } from "@/engine/state";

import { BigNumber, type BigNumberTone } from "./effects/BigNumber";
import { RentDemand } from "./effects/RentDemand";
import { SetCompleteFx } from "./effects/SetCompleteFx";
import { ShieldClash } from "./effects/ShieldClash";

// Cap concurrent overlays so a flurry of events never tiles the screen.
const MAX_OVERLAYS = 6;

type Overlay =
  | {
      id: string;
      ttl: number;
      kind: "bigNumber";
      text: string;
      x: number;
      y: number;
      tone: BigNumberTone;
      scale?: number;
    }
  | {
      id: string;
      ttl: number;
      kind: "shieldClash";
      tone: "block" | "fail";
      x?: number;
      y?: number;
    }
  | {
      id: string;
      ttl: number;
      kind: "rentDemand";
      amount: number;
      color?: string;
      fromName: string;
      multiplier?: number;
    }
  | {
      id: string;
      ttl: number;
      kind: "setComplete";
      playerId: string;
      color: string;
    };

// Distributive Omit so each variant of Overlay loses its own `id`.
type OverlayInit = Overlay extends infer T
  ? T extends { id: string }
    ? Omit<T, "id">
    : never
  : never;

let overlayIdSeq = 0;
function nextId(): string {
  overlayIdSeq += 1;
  return `fx-${overlayIdSeq}`;
}

function rectOfPlayerCenter(playerId: string): DOMRect | null {
  // Prefer the player chip / self section anchor over property-set divs (which
  // also carry data-player-id for the set-completion selector).
  const el = document.querySelector<HTMLElement>(
    `[data-player-chip="${CSS.escape(playerId)}"]`,
  );
  return el?.getBoundingClientRect() ?? null;
}

function rectOfSetGroup(playerId: string, color: string): DOMRect | null {
  const el = document.querySelector<HTMLElement>(
    `[data-player-id="${CSS.escape(playerId)}"][data-set-color="${CSS.escape(color)}"]`,
  );
  return el?.getBoundingClientRect() ?? null;
}

function rectOfDeck(): DOMRect | null {
  const el = document.querySelector<HTMLElement>(`[data-rr-deck]`);
  return el?.getBoundingClientRect() ?? null;
}

function shakeTable(): void {
  const root = document.querySelector<HTMLElement>(`[data-table-root]`);
  if (!root) return;
  root.classList.remove("rr-shake");
  // Reflow to restart animation.
  void root.offsetWidth;
  root.classList.add("rr-shake");
  window.setTimeout(() => root.classList.remove("rr-shake"), 320);
}

function pulseHandCount(playerId: string): void {
  const el = document.querySelector<HTMLElement>(
    `[data-hand-count="${CSS.escape(playerId)}"]`,
  );
  if (!el) return;
  el.classList.remove("rr-count-pulse");
  void el.offsetWidth;
  el.classList.add("rr-count-pulse");
  window.setTimeout(() => el.classList.remove("rr-count-pulse"), 600);
}

function pulseDeck(): void {
  const el = document.querySelector<HTMLElement>(`[data-rr-deck]`);
  if (!el) return;
  el.classList.remove("rr-count-pulse");
  void el.offsetWidth;
  el.classList.add("rr-count-pulse");
  window.setTimeout(() => el.classList.remove("rr-count-pulse"), 600);
}

function dimEnderChip(playerId: string): void {
  const el = document.querySelector<HTMLElement>(
    `[data-player-chip="${CSS.escape(playerId)}"]`,
  );
  if (!el) return;
  el.classList.remove("rr-turn-end-sweep");
  void el.offsetWidth;
  el.classList.add("rr-turn-end-sweep");
  window.setTimeout(() => el.classList.remove("rr-turn-end-sweep"), 700);
}

function glowNextPlayerChip(playerId: string): void {
  const el = document.querySelector<HTMLElement>(
    `[data-player-chip="${CSS.escape(playerId)}"]`,
  );
  if (!el) return;
  el.classList.remove("rr-turn-glow");
  void el.offsetWidth;
  el.classList.add("rr-turn-glow");
  window.setTimeout(() => el.classList.remove("rr-turn-glow"), 1000);
}

export function AnimationLayer() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [overlays, setOverlays] = useState<Overlay[]>([]);
  const overlaysRef = useRef(overlays);
  overlaysRef.current = overlays;
  const selfId = useGame((s) => s.selfId);
  const players = useGame((s) => s.state?.players);

  const playerNameById = useMemo(() => {
    const m = new Map<PlayerId, string>();
    for (const p of players ?? []) m.set(p.id, p.name);
    return m;
  }, [players]);

  // Audio unlock + confetti canvas wiring (once on mount).
  useEffect(() => {
    attachAudioUnlock();
  }, []);
  useEffect(() => {
    attachConfettiCanvas(canvasRef.current);
    return () => attachConfettiCanvas(null);
  }, []);

  const pushOverlay = useCallback((ov: OverlayInit) => {
    setOverlays((prev) => {
      const id = nextId();
      const next = [...prev, { ...ov, id } as Overlay];
      // Drop oldest if we're above cap.
      if (next.length > MAX_OVERLAYS) next.splice(0, next.length - MAX_OVERLAYS);
      // Auto-remove after ttl.
      window.setTimeout(() => {
        setOverlays((cur) => cur.filter((o) => o.id !== id));
      }, ov.ttl);
      return next;
    });
  }, []);

  const handleEvent = useCallback(
    (entry: LogEntry) => {
      const e: LogEvent | undefined = entry.event;
      if (!e) return;
      const isSelfActor = e.actorId !== undefined && e.actorId === selfId;
      const isSelfTarget = e.targetId !== undefined && e.targetId === selfId;
      const isSelfMultiTarget = e.targetIds?.includes(selfId ?? "");

      switch (e.kind) {
        case "draw": {
          // Drawer feedback: deck pulse + soft thwip + tap.
          pulseDeck();
          if (e.actorId) pulseHandCount(e.actorId);
          playSfx("cardPlay", isSelfActor ? 1 : 0.55);
          if (isSelfActor) haptics.tap();
          if (e.count && e.count >= 5) {
            // Initial deal — bigger float over the deck.
            const r = rectOfDeck();
            if (r) {
              pushOverlay({
                ttl: 950,
                kind: "bigNumber",
                text: `+${e.count}`,
                x: r.left + r.width / 2,
                y: r.top + r.height / 2,
                tone: "celebration",
                scale: 1.1,
              });
            }
          }
          break;
        }
        case "playProperty": {
          playSfx("cardPlay", isSelfActor ? 1 : 0.5);
          if (isSelfActor) haptics.tap();
          break;
        }
        case "playMoney": {
          playSfx("moneyPickup", isSelfActor ? 1 : 0.5);
          if (isSelfActor) haptics.tap();
          if (e.amount && e.amount >= 4 && e.actorId) {
            const r = rectOfPlayerCenter(e.actorId);
            if (r) {
              pushOverlay({
                ttl: 900,
                kind: "bigNumber",
                text: `+$${e.amount}M`,
                x: r.left + r.width / 2,
                y: r.top + 8,
                tone: "good",
              });
            }
          }
          break;
        }
        case "house":
        case "hotel": {
          playSfx("cardPlay", isSelfActor ? 1 : 0.5);
          if (isSelfActor) haptics.bump();
          break;
        }
        case "passGo": {
          playSfx("cardPlay", isSelfActor ? 0.9 : 0.45);
          if (isSelfActor) haptics.tap();
          break;
        }
        case "reassignWild": {
          playSfx("cardPlay", isSelfActor ? 0.7 : 0.4);
          break;
        }
        case "setComplete": {
          playSfx("setComplete");
          if (isSelfActor) haptics.success();
          if (e.actorId && e.color) {
            const r = rectOfSetGroup(e.actorId, e.color);
            if (r) {
              burstFromRect(r, e.color);
              pushOverlay({
                ttl: 950,
                kind: "bigNumber",
                text: "MONOPOLY!",
                x: r.left + r.width / 2,
                y: r.top + 8,
                tone: "celebration",
                scale: 1.2,
              });
            }
            pushOverlay({
              ttl: 950,
              kind: "setComplete",
              playerId: e.actorId,
              color: e.color,
            });
          }
          break;
        }
        case "setBroken": {
          // Quiet cue — no SFX (handled by the action that broke it).
          break;
        }
        case "slyDeal": {
          // Two events fire under this kind: declaration and applied steal.
          // Both are useful — the declaration warns the table, the apply moves
          // the card. We treat both with theft cues.
          playSfx("theft");
          if (isSelfActor) haptics.bump();
          if (isSelfTarget) haptics.clash();
          if (e.targetId) {
            const r = rectOfPlayerCenter(e.targetId);
            if (r) {
              pushOverlay({
                ttl: 900,
                kind: "bigNumber",
                text: "STEAL!",
                x: r.left + r.width / 2,
                y: r.top + 8,
                tone: "bad",
              });
            }
          }
          break;
        }
        case "forcedDeal": {
          playSfx("theft");
          if (isSelfActor) haptics.bump();
          if (isSelfTarget) haptics.clash();
          if (e.targetId) {
            const r = rectOfPlayerCenter(e.targetId);
            if (r) {
              pushOverlay({
                ttl: 900,
                kind: "bigNumber",
                text: "SWAP!",
                x: r.left + r.width / 2,
                y: r.top + 8,
                tone: "neutral",
              });
            }
          }
          break;
        }
        case "dealBreaker": {
          playSfx("theft", 1.1);
          shakeTable();
          if (isSelfActor) haptics.success();
          if (isSelfTarget) haptics.clash();
          if (e.actorId && e.color) {
            // Confetti from the thief's would-be set landing zone.
            const r = rectOfSetGroup(e.actorId, e.color) ?? rectOfPlayerCenter(e.actorId);
            if (r) burstFromRect(r, e.color);
          }
          if (e.targetId) {
            const r = rectOfPlayerCenter(e.targetId);
            if (r) {
              pushOverlay({
                ttl: 1100,
                kind: "bigNumber",
                text: "DEAL BREAKER!",
                x: r.left + r.width / 2,
                y: r.top + 4,
                tone: "bad",
                scale: 1.15,
              });
            }
          }
          break;
        }
        case "debtCollector": {
          playSfx("theft", 0.8);
          if (isSelfTarget) haptics.bump();
          break;
        }
        case "birthday": {
          playSfx("moneyPickup");
          if (isSelfActor) haptics.success();
          if (isSelfMultiTarget) haptics.bump();
          break;
        }
        case "rent": {
          if (e.actorId) {
            const fromName = playerNameById.get(e.actorId) ?? "Player";
            pushOverlay({
              ttl: 3450,
              kind: "rentDemand",
              amount: e.amount ?? 0,
              color: e.color,
              fromName,
              multiplier: e.multiplier,
            });
          }
          if (isSelfMultiTarget || isSelfTarget) haptics.bump();
          break;
        }
        case "justSayNo": {
          playSfx("clash");
          if (isSelfActor) haptics.clash();
          pushOverlay({ ttl: 600, kind: "shieldClash", tone: "block" });
          break;
        }
        case "jsnCanceled": {
          playSfx("clash", 0.7);
          pushOverlay({ ttl: 600, kind: "shieldClash", tone: "fail" });
          if (e.targetId) {
            const r = rectOfPlayerCenter(e.targetId);
            if (r) {
              pushOverlay({
                ttl: 900,
                kind: "bigNumber",
                text: "BLOCKED!",
                x: r.left + r.width / 2,
                y: r.top + 8,
                tone: "bad",
              });
            }
          }
          break;
        }
        case "pay": {
          playSfx("pay", isSelfActor || isSelfTarget ? 1 : 0.6);
          if (isSelfActor) haptics.tap();
          if (e.targetId) {
            const r = rectOfPlayerCenter(e.targetId);
            if (r && e.amount) {
              pushOverlay({
                ttl: 900,
                kind: "bigNumber",
                text: `+$${e.amount}M`,
                x: r.left + r.width / 2,
                y: r.top + 8,
                tone: "good",
              });
            }
          }
          if (e.actorId && e.amount) {
            const r = rectOfPlayerCenter(e.actorId);
            if (r) {
              pushOverlay({
                ttl: 900,
                kind: "bigNumber",
                text: `−$${e.amount}M`,
                x: r.left + r.width / 2,
                y: r.top + 24,
                tone: "bad",
              });
            }
          }
          break;
        }
        case "turnStart": {
          if (e.actorId) glowNextPlayerChip(e.actorId);
          // Turn SFX only audible on self's turn; opponents get a quiet ping.
          playSfx("turn", isSelfActor ? 1 : 0.35);
          if (isSelfActor) haptics.tap();
          break;
        }
        case "win": {
          shakeTable();
          playSfx("win");
          haptics.success();
          winRoll();
          break;
        }
        default:
          break;
      }
      // Dim the previous turn-ender's chip when we see a turnStart, by
      // reading the prior actor — we approximate with a quick sweep on
      // every chip not equal to the new actor.
      if (e.kind === "turnStart" && e.actorId && players) {
        for (const p of players) {
          if (p.id !== e.actorId) dimEnderChip(p.id);
        }
      }
    },
    [pushOverlay, selfId, playerNameById, players],
  );

  useGameEvents(handleEvent);

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-[60]"
      data-rr-animation-layer
    >
      <canvas
        ref={canvasRef}
        className="pointer-events-none absolute inset-0 h-full w-full"
      />
      <AnimatePresence>
        {overlays.map((o) => {
          if (o.kind === "bigNumber") {
            return (
              <BigNumber
                key={o.id}
                text={o.text}
                x={o.x}
                y={o.y}
                tone={o.tone}
                scale={o.scale}
              />
            );
          }
          if (o.kind === "shieldClash") {
            return <ShieldClash key={o.id} tone={o.tone} x={o.x} y={o.y} />;
          }
          if (o.kind === "rentDemand") {
            return (
              <RentDemand
                key={o.id}
                amount={o.amount}
                color={o.color}
                fromName={o.fromName}
                multiplier={o.multiplier}
              />
            );
          }
          if (o.kind === "setComplete") {
            return <SetCompleteFx key={o.id} playerId={o.playerId} color={o.color} />;
          }
          return null;
        })}
      </AnimatePresence>
    </div>
  );
}
