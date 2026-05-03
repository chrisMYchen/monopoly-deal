"use client";

import { useMemo, useState } from "react";
import { LayoutGroup } from "motion/react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";

import {
  ALL_COLORS,
  SET_DEFS,
  STANDARD_COLORS,
  cardById,
  type CardId,
  type SetColor,
} from "@/engine/cards";
import type { ProjectedGameState, ProjectedPlayer } from "@/engine/project";
import type { Action } from "@/engine/reduce";
import { useGame } from "@/lib/gameStore";
import type { WsClient } from "@/lib/wsClient";

import { Card, CardBack } from "./Card";
import {
  CompleteSetPicker,
  DiscardToLimitDialog,
  HouseHotelTargetPicker,
  JsnPrompt,
  MyPropertyPicker,
  OpponentPropertyPicker,
  PaymentDialog,
  PlayerPicker,
  RentColorPicker,
  SpectatorPendingOverlay,
  WildAssignPicker,
} from "./Dialogs";
import { DiscardPile } from "./DiscardPile";
import { DropZone } from "./DropZone";
import { GameLog } from "./GameLog";
import { HandView } from "./HandView";
import { HelpButton } from "./HelpSheet";
import { OpponentStrip } from "./OpponentStrip";
import { PlayerAvatar } from "./PlayerAvatar";
import { SetProgress } from "./SetProgress";
import { TableauView } from "./TableauView";
import { Toasts } from "./Toasts";
import { TurnTimerPill } from "./TurnTimerPill";
import { colorForPlayerId } from "@/lib/playerColor";
import { ACTION_DESCRIPTIONS, ACTION_LABELS } from "@/engine/cards";
import { distinctCompletedSets, rentForGroup as rentForUI } from "@/engine/selectors";

// Draft state for a multi-step action a player is constructing.
type ActionDraft =
  | null
  | { kind: "wild-place"; cardId: CardId; allowed: SetColor[] }
  | { kind: "wild-reassign"; cardId: CardId; fromColor: SetColor; allowed: SetColor[] }
  | { kind: "sly-pick-target"; cardId: CardId }
  | { kind: "sly-pick-card"; cardId: CardId; targetPlayerId: string }
  | { kind: "forced-pick-mine"; cardId: CardId }
  | { kind: "forced-pick-target"; cardId: CardId; myCardId: CardId }
  | { kind: "forced-pick-target-card"; cardId: CardId; myCardId: CardId; targetPlayerId: string }
  | { kind: "breaker-pick-target"; cardId: CardId }
  | { kind: "breaker-pick-set"; cardId: CardId; targetPlayerId: string }
  | { kind: "debt-pick-target"; cardId: CardId }
  | { kind: "rent-pick-color"; cardId: CardId; allowedColors: SetColor[]; isWild: boolean }
  | { kind: "rent-pick-target"; cardId: CardId; color: SetColor }
  | { kind: "house-pick"; cardId: CardId; isHotel: boolean };

export function PlayingTable(props: { client: WsClient }) {
  // Outer scope owns DndContext + drag overlay so any sub-render below benefits
  // from drag-to-play without restructuring every Wrapper call site.
  const [activeDragCardId, setActiveDragCardId] = useState<CardId | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
  );

  return (
    <DndContext
      sensors={sensors}
      onDragStart={(e) => setActiveDragCardId(e.active.data.current?.cardId as CardId | null)}
      onDragEnd={(e) => {
        setActiveDragCardId(null);
        playingTableHandleDragEnd?.(e);
      }}
    >
      <PlayingTableInner {...props} setDragHandler={(fn) => (playingTableHandleDragEnd = fn)} />
      <DragOverlay>
        {activeDragCardId ? (
          <div className="pointer-events-none rotate-3 scale-105 opacity-90 shadow-2xl">
            <Card cardId={activeDragCardId} size="md" animated={false} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

// The inner component keeps the existing render structure. We expose its
// drag-end handler via a closure so the outer DndContext can route events to
// it without prop-drilling through 17 Wrapper sites.
let playingTableHandleDragEnd: ((e: DragEndEvent) => void) | null = null;

function PlayingTableInner({
  client,
  setDragHandler,
}: {
  client: WsClient;
  setDragHandler: (fn: (e: DragEndEvent) => void) => void;
}) {
  const state = useGame((s) => s.state)!;
  const selfId = useGame((s) => s.selfId)!;

  const self = state.players.find((p) => p.id === selfId)!;
  const opponents = state.players.filter((p) => p.id !== selfId);
  const currentPlayer = state.players[state.currentTurn]!;
  const isMyTurn = currentPlayer.id === selfId;

  const [selectedCardId, setSelectedCardId] = useState<CardId | null>(null);
  const [draft, setDraft] = useState<ActionDraft>(null);

  const send = (action: Action) => client.sendAction(action);

  // Register the latest drag-end handler so the outer DndContext routes
  // through this component's closure (with current state + setters).
  setDragHandler(handleDragEnd);

  // dnd-kit sensors. PointerSensor with a small distance threshold so a quick
  // tap still triggers onClick (select) instead of starting a drag. TouchSensor
  // requires a press-delay so finger scrolling doesn't accidentally drag.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
  );

  // Route a drag-end event into the appropriate action or draft. Source data
  // includes the card id; over.data.current includes the drop-zone kind.
  function handleDragEnd(e: DragEndEvent) {
    const card = e.active.data.current?.cardId as CardId | undefined;
    const overKind = e.over?.data.current?.kind as string | undefined;
    const overOpponentId = e.over?.data.current?.opponentId as string | undefined;
    if (!card || !overKind) return;
    if (!isMyTurn || !state.hasDrawnThisTurn || state.pending !== null) return;

    const c = cardById(card);

    if (overKind === "self-tableau") {
      if (c.kind === "property") {
        send({ type: "PLAY_PROPERTY", playerId: selfId, cardId: card, assignedColor: c.set });
        setSelectedCardId(null);
        return;
      }
      if (c.kind === "wild2") {
        setDraft({ kind: "wild-place", cardId: card, allowed: c.sets as SetColor[] });
        return;
      }
      if (c.kind === "wild10") {
        setDraft({ kind: "wild-place", cardId: card, allowed: ALL_COLORS });
        return;
      }
      if (c.kind === "action") {
        // House/Hotel land on tableau (open picker); other actions handled below.
        if (c.action === "house") {
          setDraft({ kind: "house-pick", cardId: card, isHotel: false });
          return;
        }
        if (c.action === "hotel") {
          setDraft({ kind: "house-pick", cardId: card, isHotel: true });
          return;
        }
        if (c.action === "passGo") {
          send({ type: "PLAY_PASS_GO", playerId: selfId, cardId: card });
          setSelectedCardId(null);
          return;
        }
        if (c.action === "birthday") {
          send({ type: "PLAY_BIRTHDAY", playerId: selfId, cardId: card });
          setSelectedCardId(null);
          return;
        }
        if (c.action === "rent") {
          const sets = (c.rentSets ?? []) as SetColor[];
          const owned = sets.filter((color) => self.tableau.some((g) => g.color === color && g.cardIds.length > 0));
          setDraft({ kind: "rent-pick-color", cardId: card, allowedColors: owned.length > 0 ? owned : sets, isWild: !!c.rentSingleTarget });
          return;
        }
      }
      return;
    }

    if (overKind === "self-bank") {
      if (c.kind === "wild2" || c.kind === "wild10" || c.kind === "property") return;
      send({ type: "PLAY_AS_MONEY", playerId: selfId, cardId: card });
      setSelectedCardId(null);
      return;
    }

    if (overKind === "opponent" && overOpponentId) {
      // Route action card to the appropriate target picker, pre-filling the opponent.
      if (c.kind !== "action") return;
      switch (c.action) {
        case "slyDeal":
          setDraft({ kind: "sly-pick-card", cardId: card, targetPlayerId: overOpponentId });
          return;
        case "forcedDeal":
          setDraft({ kind: "forced-pick-mine", cardId: card });
          return;
        case "dealBreaker":
          setDraft({ kind: "breaker-pick-set", cardId: card, targetPlayerId: overOpponentId });
          return;
        case "debtCollector":
          send({ type: "PLAY_DEBT_COLLECTOR", playerId: selfId, cardId: card, targetPlayerId: overOpponentId });
          setSelectedCardId(null);
          return;
        case "rent":
          if (c.rentSingleTarget) {
            const sets = (c.rentSets ?? []) as SetColor[];
            const owned = sets.filter((color) => self.tableau.some((g) => g.color === color && g.cardIds.length > 0));
            if (owned.length === 1) {
              send({ type: "PLAY_RENT", playerId: selfId, cardId: card, color: owned[0]!, singleTargetId: overOpponentId });
            } else {
              setDraft({ kind: "rent-pick-color", cardId: card, allowedColors: owned.length > 0 ? owned : sets, isWild: true });
            }
          }
          return;
      }
    }
  }

  // ----- Pending state branch -----
  // These take precedence over normal play.

  if (state.pending?.kind === "awaitDiscardToLimit" && state.pending.playerId === selfId) {
    return (
      <Wrapper state={state}>
        <DiscardToLimitDialog
          hand={self.hand}
          mustDiscard={state.pending.mustDiscard}
          onSubmit={(cardIds) =>
            send({ type: "DISCARD_TO_LIMIT", playerId: selfId, cardIds })
          }
        />
        <SelfArea
          self={self}
          isMyTurn={false}
          state={state}
          onCardSelect={() => undefined}
          selectedCardId={null}
        />
      </Wrapper>
    );
  }

  if (state.pending?.kind === "awaitJustSayNo") {
    const w = state.pending;
    const isMineToRespond = w.responderIsActor
      ? w.declaration.sourceId === selfId
      : w.pendingDefenders[0] === selfId;
    if (isMineToRespond) {
      const jsnsInHand = self.hand.filter((cid) => {
        const c = cardById(cid);
        return c.kind === "action" && c.action === "justSayNo";
      });
      // Surface what's specifically at stake for each declaration kind.
      let preview: { kind: "card"; cardId: CardId } | { kind: "amount"; amount: number } | undefined;
      if (w.declaration.kind === "slyDeal" || w.declaration.kind === "forcedDeal") {
        preview = { kind: "card", cardId: w.declaration.targetCardId };
      } else if (w.declaration.kind === "debtCollector") {
        preview = { kind: "amount", amount: 5 };
      } else if (w.declaration.kind === "birthday") {
        preview = { kind: "amount", amount: 2 };
      } else if (w.declaration.kind === "rent") {
        const sourcePlayer = state.players.find((p) => p.id === w.declaration.sourceId);
        const baseGroup = sourcePlayer?.tableau.find(
          (g) => w.declaration.kind === "rent" && g.color === w.declaration.color,
        );
        const baseRent = baseGroup ? rentForUI(baseGroup) : 0;
        preview = { kind: "amount", amount: baseRent * w.declaration.multiplier };
      }
      return (
        <Wrapper state={state}>
          <JsnPrompt
            responderName={self.name}
            prompt={describeDeclaration(w.declaration, state)}
            jsnInHand={jsnsInHand[0] ?? null}
            jsnInventory={jsnsInHand.length}
            preview={preview}
            chainDepth={w.jsnStack.length}
            onPlay={(cid) =>
              send({ type: "RESPOND_JSN", playerId: selfId, play: true, cardId: cid })
            }
            onPass={() => send({ type: "RESPOND_JSN", playerId: selfId, play: false })}
          />
        </Wrapper>
      );
    }
  }

  if (state.pending?.kind === "awaitPayment" && state.pending.payerId === selfId) {
    return (
      <Wrapper state={state}>
        <PaymentDialog
          payer={self}
          amountOwed={state.pending.amountOwed}
          reason={describeDeclaration(state.pending.declaration, state)}
          onSubmit={(cardIds) => send({ type: "PAY", playerId: selfId, cardIds })}
        />
        <SelfArea
          self={self}
          isMyTurn={false}
          state={state}
          onCardSelect={() => undefined}
          selectedCardId={null}
        />
      </Wrapper>
    );
  }

  // ----- Action drafting modals -----

  if (draft?.kind === "wild-place") {
    const isRainbow = cardById(draft.cardId).kind === "wild10";
    return (
      <Wrapper state={state}>
        <WildAssignPicker
          title="Pick a color for this wild"
          options={draft.allowed}
          self={self}
          isRainbow={isRainbow}
          onPick={(color) => {
            send({ type: "PLAY_PROPERTY", playerId: selfId, cardId: draft.cardId, assignedColor: color });
            setDraft(null);
            setSelectedCardId(null);
          }}
          onCancel={() => setDraft(null)}
        />
        <RestOfTable state={state} self={self} opponents={opponents} currentPlayer={currentPlayer} isMyTurn={isMyTurn} selectedCardId={null} setSelectedCardId={setSelectedCardId} />
      </Wrapper>
    );
  }

  if (draft?.kind === "wild-reassign") {
    const isRainbow = cardById(draft.cardId).kind === "wild10";
    return (
      <Wrapper state={state}>
        <WildAssignPicker
          title={`Move wild from ${draft.fromColor} to…`}
          subtitle="Free — does not use a play."
          options={draft.allowed.filter((c) => c !== draft.fromColor)}
          self={self}
          isRainbow={isRainbow}
          onPick={(color) => {
            send({
              type: "REASSIGN_WILD",
              playerId: selfId,
              cardId: draft.cardId,
              fromColor: draft.fromColor,
              toColor: color,
            });
            setDraft(null);
            setSelectedCardId(null);
          }}
          onCancel={() => setDraft(null)}
        />
        <RestOfTable state={state} self={self} opponents={opponents} currentPlayer={currentPlayer} isMyTurn={isMyTurn} selectedCardId={null} setSelectedCardId={setSelectedCardId} />
      </Wrapper>
    );
  }

  if (draft?.kind === "sly-pick-target") {
    return (
      <Wrapper state={state}>
        <PlayerPicker
          title="Pick an opponent to swipe from"
          opponents={opponents}
          onPick={(pid) => setDraft({ kind: "sly-pick-card", cardId: draft.cardId, targetPlayerId: pid })}
          onCancel={() => setDraft(null)}
        />
        <RestOfTable state={state} self={self} opponents={opponents} currentPlayer={currentPlayer} isMyTurn={isMyTurn} selectedCardId={null} setSelectedCardId={setSelectedCardId} />
      </Wrapper>
    );
  }

  if (draft?.kind === "sly-pick-card") {
    const target = state.players.find((p) => p.id === draft.targetPlayerId)!;
    return (
      <Wrapper state={state}>
        <OpponentPropertyPicker
          title={`Pick a property to take from ${target.name}`}
          opponent={target}
          predicate={(gi, _cid) => {
            const g = target.tableau[gi]!;
            return g.cardIds.length < /* not complete */ 99 && !isCompleteForUI(g, state);
          }}
          onPick={(cardId) => {
            send({
              type: "PLAY_SLY_DEAL",
              playerId: selfId,
              cardId: draft.cardId,
              targetPlayerId: draft.targetPlayerId,
              targetCardId: cardId,
            });
            setDraft(null);
            setSelectedCardId(null);
          }}
          onCancel={() => setDraft(null)}
        />
        <RestOfTable state={state} self={self} opponents={opponents} currentPlayer={currentPlayer} isMyTurn={isMyTurn} selectedCardId={null} setSelectedCardId={setSelectedCardId} />
      </Wrapper>
    );
  }

  if (draft?.kind === "forced-pick-mine") {
    return (
      <Wrapper state={state}>
        <MyPropertyPicker
          title="Pick one of your properties to trade"
          self={self}
          predicate={(gi) => !isCompleteForUI(self.tableau[gi]!, state)}
          onPick={(cardId) =>
            setDraft({ kind: "forced-pick-target", cardId: draft.cardId, myCardId: cardId })
          }
          onCancel={() => setDraft(null)}
        />
        <RestOfTable state={state} self={self} opponents={opponents} currentPlayer={currentPlayer} isMyTurn={isMyTurn} selectedCardId={null} setSelectedCardId={setSelectedCardId} />
      </Wrapper>
    );
  }

  if (draft?.kind === "forced-pick-target") {
    return (
      <Wrapper state={state}>
        <PlayerPicker
          title="Pick an opponent to swap with"
          opponents={opponents}
          onPick={(pid) =>
            setDraft({
              kind: "forced-pick-target-card",
              cardId: draft.cardId,
              myCardId: draft.myCardId,
              targetPlayerId: pid,
            })
          }
          onCancel={() => setDraft(null)}
        />
        <RestOfTable state={state} self={self} opponents={opponents} currentPlayer={currentPlayer} isMyTurn={isMyTurn} selectedCardId={null} setSelectedCardId={setSelectedCardId} />
      </Wrapper>
    );
  }

  if (draft?.kind === "forced-pick-target-card") {
    const target = state.players.find((p) => p.id === draft.targetPlayerId)!;
    return (
      <Wrapper state={state}>
        <OpponentPropertyPicker
          title={`Pick ${target.name}'s property to take`}
          opponent={target}
          predicate={(gi) => !isCompleteForUI(target.tableau[gi]!, state)}
          onPick={(cardId) => {
            send({
              type: "PLAY_FORCED_DEAL",
              playerId: selfId,
              cardId: draft.cardId,
              myCardId: draft.myCardId,
              targetPlayerId: draft.targetPlayerId,
              targetCardId: cardId,
            });
            setDraft(null);
            setSelectedCardId(null);
          }}
          onCancel={() => setDraft(null)}
        />
        <RestOfTable state={state} self={self} opponents={opponents} currentPlayer={currentPlayer} isMyTurn={isMyTurn} selectedCardId={null} setSelectedCardId={setSelectedCardId} />
      </Wrapper>
    );
  }

  if (draft?.kind === "breaker-pick-target") {
    return (
      <Wrapper state={state}>
        <PlayerPicker
          title="Pick an opponent to break"
          opponents={opponents}
          onPick={(pid) => setDraft({ kind: "breaker-pick-set", cardId: draft.cardId, targetPlayerId: pid })}
          onCancel={() => setDraft(null)}
        />
        <RestOfTable state={state} self={self} opponents={opponents} currentPlayer={currentPlayer} isMyTurn={isMyTurn} selectedCardId={null} setSelectedCardId={setSelectedCardId} />
      </Wrapper>
    );
  }

  if (draft?.kind === "breaker-pick-set") {
    const target = state.players.find((p) => p.id === draft.targetPlayerId)!;
    return (
      <Wrapper state={state}>
        <CompleteSetPicker
          title={`Pick a complete set to take from ${target.name}`}
          opponent={target}
          onPick={(color, gi) => {
            send({
              type: "PLAY_DEAL_BREAKER",
              playerId: selfId,
              cardId: draft.cardId,
              targetPlayerId: draft.targetPlayerId,
              targetColor: color,
              targetGroupIdx: gi,
            });
            setDraft(null);
            setSelectedCardId(null);
          }}
          onCancel={() => setDraft(null)}
        />
        <RestOfTable state={state} self={self} opponents={opponents} currentPlayer={currentPlayer} isMyTurn={isMyTurn} selectedCardId={null} setSelectedCardId={setSelectedCardId} />
      </Wrapper>
    );
  }

  if (draft?.kind === "debt-pick-target") {
    return (
      <Wrapper state={state}>
        <PlayerPicker
          title="Pick an opponent to evict ($5M)"
          opponents={opponents}
          onPick={(pid) => {
            send({
              type: "PLAY_DEBT_COLLECTOR",
              playerId: selfId,
              cardId: draft.cardId,
              targetPlayerId: pid,
            });
            setDraft(null);
            setSelectedCardId(null);
          }}
          onCancel={() => setDraft(null)}
        />
        <RestOfTable state={state} self={self} opponents={opponents} currentPlayer={currentPlayer} isMyTurn={isMyTurn} selectedCardId={null} setSelectedCardId={setSelectedCardId} />
      </Wrapper>
    );
  }

  if (draft?.kind === "rent-pick-color") {
    return (
      <Wrapper state={state}>
        <RentColorPicker
          title={
            draft.isWild
              ? "Pick a color you own (will charge ONE opponent)"
              : "Pick which color to charge (all opponents)"
          }
          options={draft.allowedColors}
          onPick={(color) => {
            if (draft.isWild) {
              setDraft({ kind: "rent-pick-target", cardId: draft.cardId, color });
            } else {
              send({ type: "PLAY_RENT", playerId: selfId, cardId: draft.cardId, color });
              setDraft(null);
              setSelectedCardId(null);
            }
          }}
          onCancel={() => setDraft(null)}
        />
        <RestOfTable state={state} self={self} opponents={opponents} currentPlayer={currentPlayer} isMyTurn={isMyTurn} selectedCardId={null} setSelectedCardId={setSelectedCardId} />
      </Wrapper>
    );
  }

  if (draft?.kind === "rent-pick-target") {
    return (
      <Wrapper state={state}>
        <PlayerPicker
          title="Pick the opponent to charge"
          opponents={opponents}
          onPick={(pid) => {
            send({
              type: "PLAY_RENT",
              playerId: selfId,
              cardId: draft.cardId,
              color: draft.color,
              singleTargetId: pid,
            });
            setDraft(null);
            setSelectedCardId(null);
          }}
          onCancel={() => setDraft(null)}
        />
        <RestOfTable state={state} self={self} opponents={opponents} currentPlayer={currentPlayer} isMyTurn={isMyTurn} selectedCardId={null} setSelectedCardId={setSelectedCardId} />
      </Wrapper>
    );
  }

  if (draft?.kind === "house-pick") {
    return (
      <Wrapper state={state}>
        <HouseHotelTargetPicker
          title={draft.isHotel ? "Place a hotel on..." : "Place a house on..."}
          self={self}
          needsHouse={draft.isHotel}
          onPick={(color) => {
            send({
              type: draft.isHotel ? "PLAY_HOTEL" : "PLAY_HOUSE",
              playerId: selfId,
              cardId: draft.cardId,
              targetColor: color,
            });
            setDraft(null);
            setSelectedCardId(null);
          }}
          onCancel={() => setDraft(null)}
        />
        <RestOfTable state={state} self={self} opponents={opponents} currentPlayer={currentPlayer} isMyTurn={isMyTurn} selectedCardId={null} setSelectedCardId={setSelectedCardId} />
      </Wrapper>
    );
  }

  // ----- Normal in-turn rendering -----
  // For non-active players who are NOT the JSN responder / payer, show a
  // spectator overlay describing what's blocking the game.

  // Tap-to-reassign for placed wildcards. Free in real Monopoly Deal so it
  // doesn't gate on playsRemaining — only on it being your active turn with
  // no pending window.
  const onWildClick = (cardId: CardId, fromColor: SetColor) => {
    if (!isMyTurn || state.pending !== null || !state.hasDrawnThisTurn) return;
    const card = cardById(cardId);
    if (card.kind !== "wild2" && card.kind !== "wild10") return;
    const allowed = card.kind === "wild2" ? (card.sets as SetColor[]) : ALL_COLORS;
    setDraft({ kind: "wild-reassign", cardId, fromColor, allowed });
  };

  return (
    <Wrapper state={state}>
      {state.pending !== null && (
        <SpectatorPendingOverlay state={state} />
      )}
      <RestOfTable
        state={state}
        self={self}
        opponents={opponents}
        currentPlayer={currentPlayer}
        isMyTurn={isMyTurn}
        selectedCardId={selectedCardId}
        setSelectedCardId={setSelectedCardId}
        onWildClick={onWildClick}
      />
      {isMyTurn && state.pending === null && (
        <ActionBar
          state={state}
          self={self}
          selectedCardId={selectedCardId}
          onPlay={(action) => {
            send(action);
            setSelectedCardId(null);
          }}
          onDraw={() => send({ type: "DRAW_TURN_START", playerId: selfId })}
          onEndTurn={() => send({ type: "END_TURN", playerId: selfId })}
          beginDraft={(d) => setDraft(d)}
        />
      )}
    </Wrapper>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function Wrapper({ state, children }: { state: ProjectedGameState; children: React.ReactNode }) {
  // LayoutGroup ensures Motion shares the layout-tracking root across the
  // entire game surface: a card moving from hand to tableau, or from one
  // player's tableau to another's via Sly Deal, animates smoothly because
  // both endpoints share the same `layoutId="card-<id>"`.
  return (
    <LayoutGroup>
      <main className="flex min-h-dvh flex-col gap-2 p-2 pb-40 sm:p-4 sm:pb-40">
        <TopBanner state={state} />
        {children}
        <GameLog log={state.log} />
        <Toasts log={state.log} />
        <HelpButton />
      </main>
    </LayoutGroup>
  );
}

function TopBanner({ state }: { state: ProjectedGameState }) {
  const cur = state.players[state.currentTurn]!;
  const pendingMsg = describePending(state);
  const isMyTurn = state.selfId === cur.id;
  const onClockId = onClockPlayerIdFromProjected(state);
  return (
    <div
      className={[
        "rounded-md border bg-white/5 px-3 py-2 text-center text-sm transition-colors",
        isMyTurn ? "rr-pulse" : "border-white/15",
      ].join(" ")}
      data-testid="turn-banner"
    >
      <div className="flex items-center justify-center gap-2 font-semibold">
        {isMyTurn ? "Your turn" : `${cur.name}'s turn`}
        <TurnTimerPill
          deadlineMs={state.turnDeadlineMs}
          totalSeconds={state.settings?.turnTimerSeconds ?? null}
          selfOnClock={onClockId != null && onClockId === state.selfId}
        />
      </div>
      <div className="text-xs opacity-70">
        {state.hasDrawnThisTurn ? `${state.playsRemaining} plays left` : "needs to draw"}
        {pendingMsg && ` · ${pendingMsg}`}
      </div>
    </div>
  );
}

// Mirrors `onClockPlayerId` from the engine but operates on the projected
// state shape. Kept inline so the client doesn't drag in any engine modules.
function onClockPlayerIdFromProjected(state: ProjectedGameState): string | null {
  if (state.phase !== "playing") return null;
  const p = state.pending;
  if (p == null) return state.players[state.currentTurn]?.id ?? null;
  switch (p.kind) {
    case "awaitDiscardToLimit":
      return p.playerId;
    case "awaitJustSayNo":
      return p.responderIsActor
        ? p.declaration.sourceId
        : (p.pendingDefenders[0] ?? null);
    case "awaitPayment":
      return p.payerId;
    case "awaitWildAssignment":
      return p.ownerId;
  }
}

function describePending(state: ProjectedGameState): string {
  const p = state.pending;
  if (!p) return "";
  if (p.kind === "awaitDiscardToLimit") return `${nameOf(state, p.playerId)} must discard ${p.mustDiscard}`;
  if (p.kind === "awaitJustSayNo")
    return `Just Say No window — ${
      p.responderIsActor ? nameOf(state, p.declaration.sourceId) : nameOf(state, p.pendingDefenders[0]!)
    }`;
  if (p.kind === "awaitPayment")
    return `${nameOf(state, p.payerId)} owes $${p.amountOwed}M`;
  return p.kind;
}

function describeDeclaration(d: any, state: ProjectedGameState): string {
  switch (d.kind) {
    case "slyDeal":
      return `${nameOf(state, d.sourceId)} is taking a property from ${nameOf(state, d.targetId)}.`;
    case "forcedDeal":
      return `${nameOf(state, d.sourceId)} is swapping properties with ${nameOf(state, d.targetId)}.`;
    case "dealBreaker":
      return `${nameOf(state, d.sourceId)} is taking ${nameOf(state, d.targetId)}'s ${d.targetColor} set.`;
    case "debtCollector":
      return `${nameOf(state, d.sourceId)} demands $5M from ${nameOf(state, d.targetId)}.`;
    case "birthday":
      return `${nameOf(state, d.sourceId)} demands $2M from everyone.`;
    case "rent":
      return `${nameOf(state, d.sourceId)} charges rent on ${d.color}${d.multiplier > 1 ? ` ×${d.multiplier}` : ""}.`;
  }
  return "Action pending.";
}

function nameOf(state: ProjectedGameState, pid: string): string {
  return state.players.find((p) => p.id === pid)?.name ?? pid;
}

function isCompleteForUI(group: import("@/engine/state").TableauGroup, _state: ProjectedGameState): boolean {
  // Re-import the engine helper inline to avoid extra import noise in this file.
  // We compare against the standard def — same as engine `isComplete`.
  const completeBy = {
    brown: 2, lightBlue: 3, pink: 3, orange: 3, red: 3, yellow: 3,
    green: 3, darkBlue: 2, railroad: 4, utility: 2,
  } as const;
  return group.cardIds.length >= completeBy[group.color as keyof typeof completeBy];
}

function RestOfTable({
  state,
  self,
  opponents,
  currentPlayer,
  isMyTurn,
  selectedCardId,
  setSelectedCardId,
  onWildClick,
}: {
  state: ProjectedGameState;
  self: ProjectedPlayer;
  opponents: ProjectedPlayer[];
  currentPlayer: ProjectedPlayer;
  isMyTurn: boolean;
  selectedCardId: CardId | null;
  setSelectedCardId: (id: CardId | null) => void;
  onWildClick?: (cardId: CardId, color: SetColor) => void;
}) {
  return (
    <>
      <OpponentStrip opponents={opponents} currentTurnPlayerId={currentPlayer.id} />
      <Center state={state} />
      <SelfArea
        self={self}
        isMyTurn={isMyTurn}
        state={state}
        onCardSelect={(id) => setSelectedCardId(id)}
        selectedCardId={selectedCardId}
        onTableauCardClick={onWildClick}
      />
    </>
  );
}

function Center({ state }: { state: ProjectedGameState }) {
  return (
    <section
      className="flex items-end justify-center gap-6 py-3"
      data-testid="deck-discard"
      aria-label="Deck and discard pile"
    >
      <div className="flex flex-col items-center gap-1">
        <CardBack size="md" count={state.drawPileCount} />
        <div className="text-[10px] uppercase tracking-widest opacity-50">Deck</div>
        {/* Reshuffle warning when deck is almost empty — fair info for everyone. */}
        {state.drawPileCount > 0 && state.drawPileCount <= 5 && (
          <div
            className="rounded bg-amber-300/20 px-1.5 py-0.5 text-[10px] uppercase tracking-widest text-amber-100"
            title="Discard reshuffles into the draw pile when this empties"
          >
            🔄 reshuffle next
          </div>
        )}
      </div>
      <div className="flex flex-col items-center gap-1">
        <DiscardPile
          topCardId={state.discardTopCardId}
          count={state.discardCount}
          fullPile={state.discardPile}
        />
      </div>
    </section>
  );
}

function SelfArea({
  self,
  isMyTurn,
  state,
  onCardSelect,
  selectedCardId,
  onTableauCardClick,
}: {
  self: ProjectedPlayer;
  isMyTurn: boolean;
  state: ProjectedGameState;
  onCardSelect: (id: CardId | null) => void;
  selectedCardId: CardId | null;
  onTableauCardClick?: (cardId: CardId, color: SetColor) => void;
}) {
  const completedSets = distinctCompletedSets(self);
  const wildIds = new Set<CardId>();
  for (const g of self.tableau) {
    for (const cid of g.cardIds) {
      const c = cardById(cid);
      if (c.kind === "wild2" || c.kind === "wild10") wildIds.add(cid);
    }
  }
  return (
    <section
      className={[
        "mt-auto flex flex-col gap-2 rounded-md border p-2",
        isMyTurn ? "border-yellow-300/50 bg-yellow-300/5" : `${colorForPlayerId(self.id).border} ${colorForPlayerId(self.id).bg}`,
      ].join(" ")}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex flex-wrap items-center gap-2 font-semibold">
          <PlayerAvatar id={self.id} name={self.name} size="sm" />
          You — {self.name}
          {isMyTurn && <span className="text-yellow-300">(your turn)</span>}
          <SetProgress count={completedSets} highlight />
        </h2>
        <div className="text-xs opacity-70">
          Bank ${self.bank.reduce((s, cid) => s + bankValue(cid), 0)}M ·{" "}
          {state.hasDrawnThisTurn && isMyTurn ? `${state.playsRemaining} plays` : ""}
        </div>
      </div>
      {isMyTurn && wildIds.size > 0 && (
        <p className="text-[11px] opacity-50" aria-live="polite">
          Tap a wild card in your tableau to reassign its color (free).
        </p>
      )}
      <DropZone
        id="self-tableau"
        data={{ kind: "self-tableau" }}
        active={isMyTurn && state.pending === null && state.hasDrawnThisTurn}
        ariaLabel="Drop here to play a property"
        className="rounded-md"
        hoverClassName="ring-2 ring-blue-300/80 ring-offset-2 ring-offset-zinc-900 bg-blue-300/5"
      >
        <TableauView
          tableau={self.tableau}
          onCardClick={onTableauCardClick && isMyTurn ? onTableauCardClick : undefined}
          selectableCardIds={wildIds}
        />
        {self.tableau.length === 0 && isMyTurn && (
          <div className="rounded border border-dashed border-white/20 p-3 text-center text-[11px] opacity-50">
            Drop properties here
          </div>
        )}
      </DropZone>
      {/* Bank drop zone — visible only when it's your turn so it doesn't add noise otherwise. */}
      {isMyTurn && state.pending === null && state.hasDrawnThisTurn && (
        <DropZone
          id="self-bank"
          data={{ kind: "self-bank" }}
          ariaLabel="Drop here to bank as money"
          className="flex items-center gap-2 rounded-md border border-dashed border-emerald-300/30 bg-emerald-300/5 px-2 py-1 text-[11px] text-emerald-100/80"
          hoverClassName="ring-2 ring-emerald-300/80 ring-offset-2 ring-offset-zinc-900 bg-emerald-300/15"
        >
          <span aria-hidden>💰</span> Drop here to bank
          <span className="ml-auto opacity-60">${self.bank.reduce((s, cid) => s + bankValue(cid), 0)}M</span>
        </DropZone>
      )}
      <HandView hand={self.hand} selectedCardId={selectedCardId} onSelect={onCardSelect} />
    </section>
  );
}

function bankValue(cid: CardId): number {
  const c = cardById(cid);
  if (c.kind === "money" || c.kind === "property" || c.kind === "action") return c.value;
  return 0;
}

// ---------------------------------------------------------------------------
// ActionBar — what you can do with the selected card
// ---------------------------------------------------------------------------

function ActionBar({
  state,
  self,
  selectedCardId,
  onPlay,
  onDraw,
  onEndTurn,
  beginDraft,
}: {
  state: ProjectedGameState;
  self: ProjectedPlayer;
  selectedCardId: CardId | null;
  onPlay: (action: Action) => void;
  onDraw: () => void;
  onEndTurn: () => void;
  beginDraft: (d: ActionDraft) => void;
}) {
  if (!state.hasDrawnThisTurn) {
    return (
      <BarShell>
        <button
          onClick={onDraw}
          className="h-11 flex-1 rounded-md bg-white/90 font-semibold text-zinc-900"
          data-testid="draw-button"
        >
          Draw {self.hand.length === 0 ? "5" : "2"}
        </button>
      </BarShell>
    );
  }

  if (!selectedCardId) {
    const playsLeft = state.playsRemaining;
    return (
      <BarShell>
        <p className="flex-1 self-center text-sm opacity-70">
          Tap a card in your hand to play, or end your turn.
        </p>
        <EndTurnButton playsLeft={playsLeft} onEndTurn={onEndTurn} />
      </BarShell>
    );
  }

  const card = cardById(selectedCardId);
  return (
    <BarShell>
      <CardActionButtons
        cardId={selectedCardId}
        self={self}
        state={state}
        onPlay={onPlay}
        beginDraft={beginDraft}
      />
      <EndTurnButton playsLeft={state.playsRemaining} onEndTurn={onEndTurn} />
    </BarShell>
  );
}

// End-turn button with a one-tap "are you sure?" confirm if the player
// still has plays remaining. Beginners avoid burning value; experts can
// click straight through (the confirm only appears when value is on the line).
function EndTurnButton({
  playsLeft,
  onEndTurn,
}: {
  playsLeft: number;
  onEndTurn: () => void;
}) {
  const [confirming, setConfirming] = useState(false);

  if (confirming) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-yellow-300/50 bg-yellow-300/10 px-2 py-1 text-xs">
        <span className="opacity-90">{playsLeft} plays unused — really end?</span>
        <button
          onClick={() => {
            setConfirming(false);
            onEndTurn();
          }}
          className="h-9 rounded-md bg-white/90 px-3 font-semibold text-zinc-900"
          data-testid="end-turn-confirm"
        >
          Yes, end
        </button>
        <button
          onClick={() => setConfirming(false)}
          className="h-9 rounded-md border border-white/30 px-3 font-semibold"
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => {
        if (playsLeft > 0) setConfirming(true);
        else onEndTurn();
      }}
      className="h-11 rounded-md border border-white/30 px-4 font-semibold hover:bg-white/5"
      data-testid="end-turn-button"
      title={
        playsLeft > 0
          ? `End your turn (${playsLeft} plays left — confirm)`
          : "End your turn"
      }
    >
      End turn
    </button>
  );
}

function BarShell({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-30 flex flex-wrap items-center gap-2 border-t border-white/15 bg-zinc-900/95 p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur"
      data-testid="action-bar"
    >
      {children}
    </div>
  );
}

function CardActionButtons({
  cardId,
  self,
  state,
  onPlay,
  beginDraft,
}: {
  cardId: CardId;
  self: ProjectedPlayer;
  state: ProjectedGameState;
  onPlay: (a: Action) => void;
  beginDraft: (d: ActionDraft) => void;
}) {
  const card = cardById(cardId);
  const selfId = self.id;

  // Mechanic hint shown above the buttons. Tells beginners exactly what
  // pressing a button is going to do.
  const mechanicHint =
    card.kind === "action" ? ACTION_DESCRIPTIONS[card.action] :
    card.kind === "money" ? `Banks face-up for $${card.value}M.` :
    card.kind === "property" ? `Solid property — joins your ${card.set} group.` :
    card.kind === "wild2" ? `Wild — joins ${card.sets[0]} or ${card.sets[1]}.` :
    "Rainbow wild — must attach to a same-color group already in play.";

  const banks = (
    <button
      onClick={() => onPlay({ type: "PLAY_AS_MONEY", playerId: selfId, cardId })}
      className="h-11 flex-1 min-w-[120px] rounded-md bg-emerald-500 px-3 font-semibold text-white hover:bg-emerald-400"
      data-testid="bank-button"
      title={`Bank this card sideways as $${valueOf(card)}M.`}
    >
      Bank ${valueOf(card)}M
    </button>
  );

  // Hint label rendered alongside buttons.
  const hintLabel = (
    <div className="flex w-full items-center gap-2 text-[11px] opacity-70" aria-live="polite">
      <span className="rounded bg-white/10 px-1.5 py-0.5 uppercase tracking-widest">{cardKindLabel(card)}</span>
      <span className="leading-tight">{mechanicHint}</span>
    </div>
  );

  switch (card.kind) {
    case "money":
      return (
        <>
          {hintLabel}
          {banks}
        </>
      );
    case "property":
      return (
        <>
          {hintLabel}
          <button
            onClick={() =>
              onPlay({
                type: "PLAY_PROPERTY",
                playerId: selfId,
                cardId,
                assignedColor: card.set,
              })
            }
            className="h-11 flex-1 min-w-[120px] rounded-md bg-blue-500 px-3 font-semibold text-white hover:bg-blue-400"
            data-testid="play-property-button"
          >
            Place in {card.set}
          </button>
        </>
      );
    case "wild2":
      return (
        <>
          {hintLabel}
          <button
            onClick={() => beginDraft({ kind: "wild-place", cardId, allowed: card.sets as SetColor[] })}
            className="h-11 flex-1 min-w-[120px] rounded-md bg-blue-500 px-3 font-semibold text-white hover:bg-blue-400"
            data-testid="play-wild2-button"
          >
            Place wild ({card.sets.join("/")})
          </button>
        </>
      );
    case "wild10":
      return (
        <>
          {hintLabel}
          <button
            onClick={() => beginDraft({ kind: "wild-place", cardId, allowed: ALL_COLORS })}
            className="h-11 flex-1 min-w-[120px] rounded-md bg-blue-500 px-3 font-semibold text-white hover:bg-blue-400"
            data-testid="play-wild10-button"
          >
            Place rainbow
          </button>
        </>
      );
    case "action": {
      // Render the hint above the action buttons for every action card.
      const wrap = (children: React.ReactNode) => (
        <>
          {hintLabel}
          {children}
        </>
      );
      switch (card.action) {
        case "passGo":
          return wrap(
            <>
              <button
                onClick={() => onPlay({ type: "PLAY_PASS_GO", playerId: selfId, cardId })}
                className="h-11 flex-1 min-w-[120px] rounded-md bg-blue-500 px-3 font-semibold text-white hover:bg-blue-400"
                data-testid="play-action-button"
                title="Draw 2 extra cards now."
              >
                Round Trip (+2)
              </button>
              {banks}
            </>,
          );
        case "slyDeal":
          return wrap(
            <>
              <button
                onClick={() => beginDraft({ kind: "sly-pick-target", cardId })}
                className="h-11 flex-1 min-w-[120px] rounded-md bg-purple-500 px-3 font-semibold text-white hover:bg-purple-400"
                data-testid="play-action-button"
                title="Steal one property from an opponent (not in a complete set)."
              >
                Swipe a property
              </button>
              {banks}
            </>,
          );
        case "forcedDeal": {
          const myTradable = self.tableau.some((g) => g.cardIds.length < SET_DEFS[g.color].complete);
          return wrap(
            <>
              <button
                onClick={() => beginDraft({ kind: "forced-pick-mine", cardId })}
                disabled={!myTradable}
                className="h-11 flex-1 min-w-[120px] rounded-md bg-purple-500 px-3 font-semibold text-white hover:bg-purple-400 disabled:cursor-not-allowed disabled:opacity-40"
                data-testid="play-action-button"
                title={myTradable ? "Trade one of your properties for an opponent's." : "Need at least one of your own properties (not in a complete set) to trade."}
              >
                Tribute (swap)
              </button>
              {banks}
            </>,
          );
        }
        case "dealBreaker": {
          const anyComplete = state.players.some(
            (p) => p.id !== selfId && p.tableau.some((g) => g.cardIds.length >= SET_DEFS[g.color].complete),
          );
          return wrap(
            <>
              <button
                onClick={() => beginDraft({ kind: "breaker-pick-target", cardId })}
                disabled={!anyComplete}
                className="h-11 flex-1 min-w-[120px] rounded-md bg-red-500 px-3 font-semibold text-white hover:bg-red-400 disabled:cursor-not-allowed disabled:opacity-40"
                data-testid="play-action-button"
                title={anyComplete ? "Steal a complete set." : "No opponent has a complete set to take."}
              >
                Hostile Takeover
              </button>
              {banks}
            </>,
          );
        }
        case "debtCollector":
          return wrap(
            <>
              <button
                onClick={() => beginDraft({ kind: "debt-pick-target", cardId })}
                className="h-11 flex-1 min-w-[120px] rounded-md bg-orange-500 px-3 font-semibold text-white hover:bg-orange-400"
                data-testid="play-action-button"
                title="Force one opponent to pay you $5M."
              >
                Eviction ($5M)
              </button>
              {banks}
            </>,
          );
        case "birthday":
          return wrap(
            <>
              <button
                onClick={() => onPlay({ type: "PLAY_BIRTHDAY", playerId: selfId, cardId })}
                className="h-11 flex-1 min-w-[120px] rounded-md bg-pink-500 px-3 font-semibold text-white hover:bg-pink-400"
                data-testid="play-action-button"
                title="Every opponent owes you $2M."
              >
                Tip Jar ($2M each)
              </button>
              {banks}
            </>,
          );
        case "house": {
          const eligible = self.tableau.some(
            (g) => STANDARD_COLORS.includes(g.color) && g.cardIds.length >= SET_DEFS[g.color].complete && !g.hasHouse,
          );
          return wrap(
            <>
              <button
                onClick={() => beginDraft({ kind: "house-pick", cardId, isHotel: false })}
                disabled={!eligible}
                className="h-11 flex-1 min-w-[120px] rounded-md bg-amber-500 px-3 font-semibold text-white hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-40"
                data-testid="play-action-button"
                title={eligible ? "+$3M rent on a complete standard-color set." : "Need a complete standard-color set without a house yet."}
              >
                Place House
              </button>
              {banks}
            </>,
          );
        }
        case "hotel": {
          const eligible = self.tableau.some((g) => g.hasHouse && !g.hasHotel);
          return wrap(
            <>
              <button
                onClick={() => beginDraft({ kind: "house-pick", cardId, isHotel: true })}
                disabled={!eligible}
                className="h-11 flex-1 min-w-[120px] rounded-md bg-amber-500 px-3 font-semibold text-white hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-40"
                data-testid="play-action-button"
                title={eligible ? "+$4M rent on a complete set with a house." : "Need a complete set that already has a house."}
              >
                Place Hotel
              </button>
              {banks}
            </>,
          );
        }
        case "rent": {
          const sets = (card.rentSets ?? []) as SetColor[];
          // Filter to colors the player actually owns at least one of, otherwise
          // engine will reject. We still allow click-through for clearer error.
          const owned = sets.filter((c) => self.tableau.some((g) => g.color === c && g.cardIds.length > 0));
          const canCharge = owned.length > 0;
          return wrap(
            <>
              <button
                onClick={() =>
                  beginDraft({
                    kind: "rent-pick-color",
                    cardId,
                    allowedColors: canCharge ? owned : sets,
                    isWild: !!card.rentSingleTarget,
                  })
                }
                disabled={!canCharge}
                className="h-11 flex-1 min-w-[120px] rounded-md bg-blue-500 px-3 font-semibold text-white hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-40"
                data-testid="play-action-button"
                title={
                  canCharge
                    ? `Charge rent on ${owned.join(" or ")}.`
                    : `You don't own any ${sets.join(" or ")} property to charge.`
                }
              >
                Charge Rent
              </button>
              {banks}
            </>,
          );
        }
        case "justSayNo":
          return wrap(
            <>
              <span className="flex-1 self-center px-2 text-xs opacity-70">
                Defensive — keep in hand to counter, or bank as $4M.
              </span>
              {banks}
            </>,
          );
        case "doubleRent":
          return wrap(
            <>
              <span className="flex-1 self-center px-2 text-xs opacity-70">
                Plays only with a Rent card. (Bank for now.)
              </span>
              {banks}
            </>,
          );
      }
    }
  }
}

function valueOf(card: import("@/engine/cards").Card): number {
  switch (card.kind) {
    case "money":
    case "property":
    case "action":
      return card.value;
    case "wild2":
    case "wild10":
      return 0;
  }
}

function cardKindLabel(card: import("@/engine/cards").Card): string {
  switch (card.kind) {
    case "money":
      return "Money";
    case "property":
      return "Property";
    case "wild2":
      return "Wild";
    case "wild10":
      return "Rainbow";
    case "action":
      return ACTION_LABELS[card.action];
  }
}
