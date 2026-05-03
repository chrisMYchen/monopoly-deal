"use client";

import { useEffect, useRef, useState } from "react";

import { getWorkerOrigin } from "@/lib/config";
import { getOrCreateSessionId, getStoredName, setStoredName } from "@/lib/identity";
import { useGame } from "@/lib/gameStore";
import { connectRoom, type WsClient } from "@/lib/wsClient";

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

  // Joiners arriving via a shared link won't have a name stored yet — gate the
  // WS connection on a name being set so they can pick how they appear in the
  // lobby. Hosts who came through the home page already have a stored name and
  // skip this step.
  const [name, setName] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");

  useEffect(() => {
    const stored = getStoredName().trim();
    if (stored) {
      setName(stored);
    } else {
      setDraftName("");
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
        onError: (m) => {
          setError(m);
          setTimeout(() => setError(null), 4000);
        },
        onStatus: (s) => setConnection(s),
      },
    });
    wsRef.current = client;
    return () => {
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
          <p className="text-sm uppercase tracking-widest opacity-60">Joining room</p>
          <p className="mt-1 font-mono text-3xl tracking-[0.4em]">{roomCode}</p>
        </header>
        <form
          className="flex w-full flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <label className="flex flex-col gap-1 text-left text-sm opacity-90">
            Your name
            <input
              autoFocus
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              placeholder="Player"
              maxLength={24}
              className="h-11 rounded-md border border-white/20 bg-white/5 px-3 text-base outline-none focus:border-white/60"
              data-testid="join-name-input"
            />
          </label>
          <button
            type="submit"
            disabled={!trimmed}
            className="h-11 rounded-md bg-white/90 px-4 font-semibold text-zinc-900 transition hover:bg-white disabled:opacity-50"
            data-testid="join-submit"
          >
            Join game
          </button>
        </form>
      </main>
    );
  }

  if (!state) {
    const label =
      connection === "reconnecting"
        ? `Reconnecting to room ${roomCode}…`
        : connection === "closed"
          ? "Connection closed."
          : `Connecting to room ${roomCode}…`;
    return (
      <main className="flex min-h-dvh items-center justify-center p-6 text-center">
        <div>
          <p>{label}</p>
          {connection === "reconnecting" && (
            <p className="mt-2 text-sm opacity-70">Trying to restore your seat…</p>
          )}
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
