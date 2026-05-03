"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { getWorkerOrigin } from "@/lib/config";
import { getOrCreateSessionId, getStoredName, setStoredName } from "@/lib/identity";

export default function Home() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setName(getStoredName());
    // Touch session id so it exists by the time we navigate.
    getOrCreateSessionId();
  }, []);

  const onCreate = async () => {
    if (!name.trim()) return setError("enter your name");
    setStoredName(name.trim());
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${getWorkerOrigin()}/api/rooms`, { method: "POST" });
      if (!res.ok) throw new Error(`room create failed (${res.status})`);
      const { code } = (await res.json()) as { code: string };
      router.push(`/r/?code=${code}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const onJoin = () => {
    if (!name.trim()) return setError("enter your name");
    if (!code.trim()) return setError("enter a room code");
    setStoredName(name.trim());
    router.push(`/r/?code=${code.trim().toUpperCase()}`);
  };

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-8 p-6 text-center">
      {/* Decorative card stack — pure CSS, no assets. */}
      <div aria-hidden className="relative mb-2 h-28 w-36">
        <div className="absolute left-1/2 top-1/2 h-full w-full -translate-x-1/2 -translate-y-1/2 rotate-[-8deg] rounded-md border border-red-900 bg-gradient-to-br from-red-600 to-red-800 shadow-2xl" />
        <div className="absolute left-1/2 top-1/2 h-full w-full -translate-x-1/2 -translate-y-1/2 rotate-[3deg] rounded-md border border-red-900 bg-gradient-to-br from-red-600 to-red-800 shadow-2xl" />
        <div className="absolute left-1/2 top-1/2 flex h-full w-full -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-md border border-red-900 bg-gradient-to-br from-red-500 to-red-700 shadow-2xl">
          <div className="font-display text-lg uppercase leading-none tracking-tight text-white drop-shadow">Monopoly</div>
          <div className="mt-1 font-display text-[11px] uppercase leading-none tracking-[0.35em] text-white/85">Deal</div>
        </div>
      </div>

      <header>
        <h1 className="font-display text-5xl uppercase tracking-tight text-red-100">Monopoly Deal</h1>
        <p className="mt-2 text-base opacity-70">
          A friendly card game of property and ruthless trades.
        </p>
      </header>

      <div className="flex w-full max-w-sm flex-col gap-3">
        <label className="flex flex-col gap-1 text-left text-sm opacity-90">
          Your name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Player"
            maxLength={24}
            className="h-11 rounded-md border border-white/20 bg-white/5 px-3 text-base outline-none focus:border-white/60"
            data-testid="name-input"
          />
        </label>

        <button
          onClick={onCreate}
          disabled={busy}
          className="h-11 rounded-md bg-white/90 px-4 font-semibold text-zinc-900 transition hover:bg-white disabled:opacity-50"
          data-testid="create-room"
        >
          {busy ? "Creating..." : "Create game"}
        </button>

        <div className="flex items-center gap-2 text-xs opacity-50">
          <span className="h-px flex-1 bg-white/20" />
          or
          <span className="h-px flex-1 bg-white/20" />
        </div>

        <label className="flex flex-col gap-1 text-left text-sm opacity-90">
          Room code
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="XXXX"
            maxLength={6}
            className="h-11 rounded-md border border-white/20 bg-white/5 px-3 text-center font-mono text-lg tracking-[0.4em] outline-none focus:border-white/60"
            data-testid="code-input"
          />
        </label>
        <button
          onClick={onJoin}
          disabled={busy}
          className="h-11 rounded-md border border-white/30 px-4 font-semibold transition hover:border-white/60 disabled:opacity-50"
          data-testid="join-room"
        >
          Join with code
        </button>

        {error && (
          <p className="text-sm text-red-300" role="alert">
            {error}
          </p>
        )}
      </div>
    </main>
  );
}
