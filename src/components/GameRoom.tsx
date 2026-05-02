"use client";

import { useEffect, useRef, useState } from "react";

import { getWorkerOrigin } from "@/lib/config";
import { getOrCreateSessionId, getStoredName } from "@/lib/identity";
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

  useEffect(() => {
    const sessionId = getOrCreateSessionId();
    const name = getStoredName() || "Player";
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
        onOpen: () => setConnection("open"),
        onClose: () => setConnection("closed"),
      },
    });
    wsRef.current = client;
    return () => {
      client.close();
      reset();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomCode]);

  if (!state) {
    return (
      <main className="flex min-h-dvh items-center justify-center p-6 text-center">
        <div>
          <p>Connecting to room {roomCode}...</p>
          {connection === "closed" && <p className="mt-2 text-sm text-red-300">Connection lost.</p>}
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
      {state.phase === "lobby" && (
        <Lobby
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
