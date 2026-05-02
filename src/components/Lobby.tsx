"use client";

import { useState } from "react";

import { PlayerAvatar } from "./PlayerAvatar";
import { useGame } from "@/lib/gameStore";
import { colorForPlayerId } from "@/lib/playerColor";

export function Lobby({ onStart }: { onStart: () => void }) {
  const state = useGame((s) => s.state);
  const isHost = useGame((s) => s.isHost);
  const selfId = useGame((s) => s.selfId);
  const roomCode = useGame((s) => s.roomCode);
  const [copied, setCopied] = useState(false);

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
    startHint = "Need at least 2 players to start.";
  } else if (!allOnline) {
    startHint = "Waiting for disconnected players to come back…";
  }

  const shareUrl =
    typeof window !== "undefined" ? `${window.location.origin}/r/?code=${roomCode}` : "";

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(roomCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // ignore
    }
  }

  async function shareLink() {
    if (typeof navigator !== "undefined" && (navigator as Navigator & { share?: (data: ShareData) => Promise<void> }).share) {
      try {
        await (navigator as Navigator & { share: (data: ShareData) => Promise<void> }).share({
          title: "Realty Royale",
          text: `Join my game: code ${roomCode}`,
          url: shareUrl,
        });
      } catch {
        // user canceled — silent
      }
    } else {
      // Fallback: copy the link.
      try {
        await navigator.clipboard.writeText(shareUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
      } catch {
        // ignore
      }
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col items-center gap-6 p-6">
      <header className="text-center">
        <h1 className="text-3xl font-bold">Lobby</h1>
        <p className="mt-1 opacity-70">Share this code with friends:</p>
        <button
          onClick={copyCode}
          aria-label="Copy room code"
          className="mt-2 inline-flex items-center gap-2 rounded-md border border-white/20 bg-white/10 px-4 py-2 font-mono text-3xl tracking-[0.4em] transition hover:bg-white/15"
          data-testid="copy-code"
        >
          {roomCode}
          <span className="font-sans text-xs uppercase tracking-widest opacity-60">
            {copied ? "copied!" : "copy"}
          </span>
        </button>
        <div className="mt-2">
          <button
            onClick={shareLink}
            className="rounded-md border border-white/15 px-3 py-1 text-xs uppercase tracking-widest opacity-80 hover:bg-white/5"
            data-testid="share-link"
          >
            Share link
          </button>
        </div>
      </header>

      <section className="w-full">
        <h2 className="mb-2 text-sm uppercase tracking-widest opacity-60">
          Players ({players.length}/5)
        </h2>
        <ul className="flex flex-col gap-2">
          {players.map((p, i) => {
            const color = colorForPlayerId(p.id);
            const isSelf = p.id === selfId;
            return (
              <li
                key={p.id}
                className={[
                  "flex items-center justify-between gap-3 rounded-md border px-3 py-2",
                  isSelf ? "border-yellow-300/60 bg-yellow-300/5" : color.border + " " + color.bg,
                ].join(" ")}
                data-testid="lobby-player"
              >
                <span className="flex items-center gap-2 font-medium">
                  <PlayerAvatar id={p.id} name={p.name} />
                  {p.name}
                  {isSelf && (
                    <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] uppercase tracking-widest opacity-70">
                      you
                    </span>
                  )}
                  {i === 0 && (
                    <span className="rounded bg-amber-300/20 px-1.5 py-0.5 text-[10px] uppercase tracking-widest text-amber-200">
                      host
                    </span>
                  )}
                </span>
                <span className={`text-xs ${p.connected ? "opacity-60" : "text-red-300/80"}`}>
                  {p.connected ? "online" : "offline"}
                </span>
              </li>
            );
          })}
          {players.length < 5 && (
            <li className="rounded-md border border-dashed border-white/15 px-3 py-2 text-sm opacity-50">
              Waiting for players… (up to 5)
            </li>
          )}
        </ul>
      </section>

      {isHost ? (
        <div className="flex w-full flex-col items-center gap-2">
          <button
            onClick={onStart}
            disabled={!canStart}
            className="h-11 w-full rounded-md bg-white/90 px-4 font-semibold text-zinc-900 transition disabled:cursor-not-allowed disabled:opacity-50"
            data-testid="start-game"
          >
            Start game
          </button>
          {!canStart && <p className="text-xs opacity-60">{startHint}</p>}
        </div>
      ) : (
        <p className="text-sm opacity-60">{startHint}</p>
      )}

      <details className="mt-2 w-full text-sm opacity-80">
        <summary className="cursor-pointer text-xs uppercase tracking-widest opacity-60">
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
            Cards can be played as <em>property</em> (into your tableau), as <em>money</em> (into
            your bank, sideways), or for their <em>action</em> effect. Wild cards must join an
            existing same-color group; rainbow wilds need at least one solid card with them.
          </p>
        </div>
      </details>
    </main>
  );
}
