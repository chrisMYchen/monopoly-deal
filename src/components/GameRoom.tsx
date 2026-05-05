"use client";

import { useEffect, useRef, useState } from "react";

import { getWorkerOrigin } from "@/lib/config";
import { setBridgeClient } from "@/lib/devBridge";
import {
  consumeFreshNameMarker,
  getOrCreateSessionId,
  getStoredName,
  setStoredName,
} from "@/lib/identity";
import { useGame } from "@/lib/gameStore";
import { connectRoom, type WsClient } from "@/lib/wsClient";

import { AnimationLayer } from "./AnimationLayer";
import { Button } from "./ui/Button";
import { Lobby } from "./Lobby";
import { PlayingTable } from "./PlayingTable";
import { ResultsScreen } from "./ResultsScreen";

export function GameRoom({ roomCode }: { roomCode: string }) {
  const setState = useGame((s) => s.setState);
  const setJoined = useGame((s) => s.setJoined);
  const setError = useGame((s) => s.setError);
  const setConnection = useGame((s) => s.setConnection);
  const reset = useGame((s) => s.reset);
  const state = useGame((s) => s.state);
  const errorBanner = useGame((s) => s.errorBanner);
  const connection = useGame((s) => s.connection);

  const wsRef = useRef<WsClient | null>(null);

  // Joiners arriving via a shared link should always confirm their display
  // name, even if localStorage already has one from a previous session — the
  // person on the other end of the link may not be the same person who last
  // played here. Hosts who just came through the home page set a one-shot
  // sessionStorage marker so they can skip the prompt.
  const [name, setName] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [terminalError, setTerminalError] = useState<string | null>(null);

  useEffect(() => {
    // Dev/sim escape hatch: `?asName=Alice` forces a fresh identity for this
    // tab and skips the join prompt, so the gstack harness can spawn N tabs
    // each as a distinct named player.
    if (process.env.NODE_ENV !== "production") {
      const params = new URLSearchParams(window.location.search);
      const asName = params.get("asName")?.trim();
      if (asName) {
        setStoredName(asName);
        setName(asName);
        return;
      }
    }
    const stored = getStoredName().trim();
    const fromHome = consumeFreshNameMarker();
    if (fromHome && stored) {
      setName(stored);
    } else {
      // Pre-fill the form so returning users still get a one-tap join, but
      // they can edit before confirming.
      setDraftName(stored);
    }
  }, []);

  useEffect(() => {
    if (!name) return;
    const sessionId = getOrCreateSessionId();
    setConnection("connecting");
    const client = connectRoom({
      workerOrigin: getWorkerOrigin(),
      roomCode,
      sessionId,
      name,
      handlers: {
        onJoined: (info) => setJoined(info),
        onState: (s) => setState(s),
        onError: (m, permanent) => {
          if (permanent) {
            setTerminalError(m);
          } else {
            setError(m);
            setTimeout(() => setError(null), 4000);
          }
        },
        onStatus: (s) => setConnection(s),
      },
    });
    wsRef.current = client;
    setBridgeClient(client);
    return () => {
      setBridgeClient(null);
      client.close();
      reset();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomCode, name]);

  if (!name) {
    const trimmed = draftName.trim();
    const submit = () => {
      if (!trimmed) return;
      setStoredName(trimmed);
      setName(trimmed);
    };
    return (
      <main className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center gap-6 p-6 text-center">
        <header>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--color-ink-soft)]">
            Joining room
          </p>
          <p className="tabular mt-1 font-display text-4xl font-bold tracking-[0.32em] text-[var(--color-ink)]">
            {roomCode}
          </p>
        </header>
        <form
          className="flex w-full flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <label className="flex flex-col gap-1.5 text-left text-sm font-semibold text-[var(--color-ink)]">
            Your name
            <input
              autoFocus
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              placeholder="Player"
              maxLength={24}
              className="h-11 rounded-full border-[1.5px] border-[var(--color-ink)]/15 bg-white px-4 text-base text-[var(--color-ink)] outline-none transition focus:border-[var(--color-accent)]"
              data-testid="join-name-input"
            />
          </label>
          <Button
            type="submit"
            variant="primary"
            size="lg"
            fullWidth
            disabled={!trimmed}
            data-testid="join-submit"
          >
            Join game
          </Button>
        </form>
      </main>
    );
  }

  if (!state) {
    if (terminalError) {
      return (
        <main className="flex min-h-dvh items-center justify-center p-6 text-center">
          <div className="flex flex-col items-center gap-4">
            <p className="font-semibold text-[var(--color-accent)]">{terminalError}</p>
            <a href="/" className="text-sm underline opacity-60">Return home</a>
          </div>
        </main>
      );
    }
    const label =
      connection === "reconnecting"
        ? `Reconnecting to room ${roomCode}…`
        : connection === "closed"
          ? "Connection closed."
          : `Connecting to room ${roomCode}…`;
    return (
      <main className="flex min-h-dvh items-center justify-center p-6 text-center">
        <div className="flex flex-col items-center gap-4">
          <div>
            <p>{label}</p>
            {connection === "reconnecting" && (
              <p className="mt-2 text-sm opacity-70">Trying to restore your seat…</p>
            )}
          </div>
          <a href="/" className="text-sm underline opacity-40">Return home</a>
        </div>
      </main>
    );
  }

  return (
    <>
      {errorBanner && (
        <div className="fixed left-1/2 top-2 z-50 -translate-x-1/2 rounded-md bg-red-500/90 px-3 py-1 text-sm">
          {errorBanner}
        </div>
      )}
      {(connection === "reconnecting" || connection === "connecting") && (
        <ConnectionBanner status={connection} />
      )}
      {state.phase === "lobby" && wsRef.current && (
        <Lobby
          client={wsRef.current}
          onStart={() => {
            wsRef.current?.start();
          }}
        />
      )}
      {state.phase === "playing" && wsRef.current && <PlayingTable client={wsRef.current} />}
      {state.phase === "ended" && <ResultsScreen />}
      {state.phase !== "lobby" && <AnimationLayer />}
    </>
  );
}

// Small, non-blocking pill at the top center while the socket is recovering.
// We keep the table fully interactive — actions are buffered by wsClient and
// replayed on reconnect with idempotency keys.
function ConnectionBanner({ status }: { status: "reconnecting" | "connecting" }) {
  const text = status === "reconnecting" ? "Reconnecting…" : "Connecting…";
  return (
    <div
      className="fixed left-1/2 top-2 z-40 -translate-x-1/2 rounded-full bg-amber-500/90 px-3 py-1 text-xs font-medium text-zinc-900 shadow"
      role="status"
      aria-live="polite"
    >
      {text}
    </div>
  );
}
