"use client";

import { useState } from "react";

import { PlayerAvatar } from "./PlayerAvatar";
import { Button } from "./ui/Button";
import { Wordmark } from "./ui/Wordmark";
import { copyToClipboard } from "@/lib/clipboard";
import { useGame } from "@/lib/gameStore";
import type { WsClient } from "@/lib/wsClient";

const TIMER_OPTIONS: ReadonlyArray<{ value: number | null; label: string }> = [
  { value: null, label: "Off" },
  { value: 30, label: "30s" },
  { value: 60, label: "60s" },
  { value: 90, label: "90s" },
  { value: 120, label: "2m" },
];

export function Lobby({ client, onStart }: { client: WsClient; onStart: () => void }) {
  const state = useGame((s) => s.state);
  const isHost = useGame((s) => s.isHost);
  const selfId = useGame((s) => s.selfId);
  const roomCode = useGame((s) => s.roomCode);
  const [copied, setCopied] = useState<null | "code" | "link">(null);

  if (!state) return null;
  const players = state.players;
  const allOnline = players.every((p) => p.connected);
  const canStart = isHost && players.length >= 2 && allOnline;
  const hostName = players[0]?.name ?? "host";

  // Tells host *why* Start is dimmed.
  let startHint = "";
  if (!isHost) {
    startHint = `Waiting for ${hostName} to start.`;
  } else if (players.length < 2) {
    startHint = "Bring at least one friend to start.";
  } else if (!allOnline) {
    startHint = "Waiting for disconnected players to come back…";
  }

  const shareUrl =
    typeof window !== "undefined" ? `${window.location.origin}/r/?code=${roomCode}` : "";

  async function copyCode() {
    const ok = await copyToClipboard(roomCode);
    if (ok) {
      setCopied("code");
      setTimeout(() => setCopied(null), 1600);
    }
  }

  async function copyLink() {
    const ok = await copyToClipboard(shareUrl);
    if (ok) {
      setCopied("link");
      setTimeout(() => setCopied(null), 1600);
    }
  }

  async function shareLink() {
    const nav = navigator as Navigator & { share?: (data: ShareData) => Promise<void> };
    if (typeof navigator !== "undefined" && nav.share) {
      try {
        await nav.share({
          title: "Monopoly Deal",
          text: `Join my game: code ${roomCode}`,
          url: shareUrl,
        });
        return;
      } catch {
        // user canceled or share failed — fall through to copy
      }
    }
    await copyLink();
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col gap-6 p-6">
      <header className="flex flex-col items-center gap-3 text-center">
        <Wordmark size="md" />
        <p className="font-display text-base italic text-[var(--color-ink-soft)]">
          Pull up a chair — share this code:
        </p>

        <button
          onClick={copyCode}
          aria-label="Copy room code"
          data-testid="copy-code"
          className="surface-paper mt-1 inline-flex items-center gap-3 rounded-2xl px-6 py-3 transition hover:translate-y-[-1px]"
        >
          <span className="font-mono text-4xl font-semibold tracking-[0.4em] text-[var(--color-ink)] sm:text-5xl">
            {roomCode}
          </span>
          <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-ink-soft)]">
            {copied === "code" ? "copied!" : "tap to copy"}
          </span>
        </button>

        <div className="mt-1 flex w-full max-w-sm gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={copyLink}
            fullWidth
            data-testid="copy-link"
          >
            {copied === "link" ? "Copied!" : "Copy link"}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={shareLink}
            fullWidth
            data-testid="share-link"
          >
            Share link
          </Button>
        </div>
      </header>

      <section className="flex flex-col gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-ink-soft)]">
          Players ({players.length}/5)
        </h2>
        <ul className="flex flex-col gap-2">
          {players.map((p, i) => {
            const isSelf = p.id === selfId;
            const isHostRow = i === 0;
            return (
              <li
                key={p.id}
                data-testid="lobby-player"
                className={[
                  "surface-paper flex items-center justify-between gap-3 rounded-2xl px-4 py-2.5",
                  isSelf
                    ? "ring-2 ring-[var(--color-accent)]/60 ring-offset-2 ring-offset-[var(--color-bg)]"
                    : "",
                ].join(" ")}
              >
                <span className="flex items-center gap-2.5 font-medium text-[var(--color-ink)]">
                  <span
                    className={
                      isHostRow
                        ? "rounded-full ring-2 ring-[var(--color-gold)] ring-offset-2 ring-offset-[var(--color-paper)]"
                        : ""
                    }
                  >
                    <PlayerAvatar id={p.id} name={p.name} />
                  </span>
                  <span>{p.name}</span>
                  {isSelf && (
                    <span className="rounded-full bg-[var(--color-bg-tint)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--color-ink-soft)]">
                      you
                    </span>
                  )}
                  {isHostRow && (
                    <span className="rounded-full bg-[var(--color-gold)]/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--color-gold-deep)]">
                      host
                    </span>
                  )}
                </span>
                <span
                  className={[
                    "flex items-center gap-1.5 text-xs font-medium",
                    p.connected ? "text-[var(--color-mint)]" : "text-[var(--color-accent)]",
                  ].join(" ")}
                >
                  <span
                    aria-hidden
                    className={[
                      "inline-block h-2 w-2 rounded-full",
                      p.connected ? "bg-[var(--color-mint)]" : "bg-[var(--color-accent)]",
                    ].join(" ")}
                  />
                  {p.connected ? "online" : "offline"}
                </span>
              </li>
            );
          })}
          {players.length < 5 && (
            <li className="surface-tint flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm italic text-[var(--color-ink-soft)]">
              <span aria-hidden>🪑</span>
              Waiting for someone to sit down…
            </li>
          )}
        </ul>
      </section>

      <TurnTimerSetting
        isHost={isHost}
        selfId={selfId}
        currentValue={state.settings?.turnTimerSeconds ?? null}
        onChange={(value) => {
          if (!selfId) return;
          client.sendAction({
            type: "UPDATE_SETTINGS",
            playerId: selfId,
            settings: { turnTimerSeconds: value },
          });
        }}
      />

      {isHost ? (
        <div className="flex w-full flex-col items-center gap-2">
          <Button
            variant="primary"
            size="lg"
            fullWidth
            onClick={onStart}
            disabled={!canStart}
            data-testid="start-game"
            iconTrailing={<span aria-hidden>→</span>}
          >
            Start game
          </Button>
          {!canStart && (
            <p className="text-sm italic text-[var(--color-ink-soft)]">{startHint}</p>
          )}
        </div>
      ) : (
        <p className="text-sm italic text-[var(--color-ink-soft)]">{startHint}</p>
      )}

      <details className="mt-1 w-full text-sm text-[var(--color-ink)]">
        <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-ink-soft)]">
          How to play
        </summary>
        <div className="mt-2 space-y-2 leading-relaxed">
          <p>
            <strong>Goal:</strong> be the first player to collect 3 complete property sets of 3
            different colors.
          </p>
          <p>
            <strong>Each turn:</strong> draw 2 cards (or 5 if your hand is empty) → play up to 3
            cards → end your turn. End-of-turn hand limit is 7.
          </p>
          <p>
            Cards can be played as <em>property</em> (laid down in front of you), as <em>money</em>{" "}
            (into your bank, sideways), or for their <em>action</em> effect. Wild cards must join
            an existing same-color group; rainbow wilds need at least one solid card with them.
          </p>
        </div>
      </details>
    </main>
  );
}

function TurnTimerSetting({
  isHost,
  selfId,
  currentValue,
  onChange,
}: {
  isHost: boolean;
  selfId: string | null;
  currentValue: number | null;
  onChange: (value: number | null) => void;
}) {
  const labelFor = (v: number | null) =>
    TIMER_OPTIONS.find((o) => o.value === v)?.label ?? `${v}s`;

  if (!isHost || !selfId) {
    return (
      <section
        className="surface-paper flex w-full items-center justify-between rounded-2xl px-4 py-2.5 text-sm"
        data-testid="turn-timer-setting"
      >
        <span className="text-[var(--color-ink-soft)]">Turn timer</span>
        <span className="font-mono font-semibold text-[var(--color-ink)]" data-testid="turn-timer-value">
          {labelFor(currentValue)}
        </span>
      </section>
    );
  }

  // Host gets a segmented control — every option visible, one tap to change.
  return (
    <section
      className="surface-paper flex w-full flex-col gap-2 rounded-2xl px-4 py-3"
      data-testid="turn-timer-setting"
    >
      <div className="flex items-center justify-between text-sm">
        <span className="font-semibold text-[var(--color-ink)]">Turn timer</span>
        <span className="text-xs italic text-[var(--color-ink-soft)]">
          {labelFor(currentValue)}
        </span>
      </div>
      <div
        role="radiogroup"
        aria-label="Turn timer"
        className="surface-tint flex gap-1 rounded-full p-1"
        data-testid="turn-timer-select"
      >
        {TIMER_OPTIONS.map((opt) => {
          const active =
            (opt.value == null && currentValue == null) || opt.value === currentValue;
          return (
            <button
              key={opt.label}
              role="radio"
              aria-checked={active}
              onClick={() => onChange(opt.value)}
              className={[
                "flex-1 rounded-full px-2 py-1.5 text-sm font-semibold transition",
                active
                  ? "bg-[var(--color-inked)] text-[var(--color-ink-inverse)] shadow-sm"
                  : "text-[var(--color-ink-soft)] hover:bg-[var(--color-paper)]",
              ].join(" ")}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </section>
  );
}
