"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/Button";
import { Wordmark } from "@/components/ui/Wordmark";
import { getWorkerOrigin } from "@/lib/config";
import {
  getOrCreateSessionId,
  getStoredName,
  markNameFreshlyConfirmed,
  setStoredName,
} from "@/lib/identity";

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
    markNameFreshlyConfirmed();
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

  // Join-by-code: only the code is required from this page. The /r/ route's
  // join screen handles name entry, so an invitee who lands here can hop
  // straight into the lobby with one input.
  const onJoin = () => {
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) return setError("enter a room code");
    setError(null);
    router.push(`/r/?code=${trimmed}`);
  };

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-10 p-6 text-center">
      {/* Decorative card stack — three rotated paper cards on parchment, with
          a tiny gold border so the deck reads as premium. */}
      <div aria-hidden className="relative h-32 w-40">
        <div className="absolute left-1/2 top-1/2 h-full w-full -translate-x-1/2 -translate-y-1/2 rotate-[-9deg] rounded-xl border border-[var(--color-set-dark-blue)]/40 bg-gradient-to-br from-[var(--color-set-dark-blue)] to-[#1a3680] shadow-[0_18px_40px_-12px_rgba(15,42,46,0.45)]" />
        <div className="absolute left-1/2 top-1/2 h-full w-full -translate-x-1/2 -translate-y-1/2 rotate-[5deg] rounded-xl border border-[var(--color-set-green)]/40 bg-gradient-to-br from-[var(--color-set-green)] to-[#1f6b3b] shadow-[0_18px_40px_-12px_rgba(15,42,46,0.45)]" />
        <div className="absolute left-1/2 top-1/2 flex h-full w-full -translate-x-1/2 -translate-y-1/2 rotate-[-1deg] flex-col items-center justify-center rounded-xl border-2 border-[var(--color-gold)] bg-gradient-to-br from-[var(--color-set-red)] to-[#a8221f] shadow-[0_22px_50px_-14px_rgba(15,42,46,0.55)]">
          <div className="font-card text-2xl uppercase leading-none tracking-tight text-white drop-shadow">
            Monopoly
          </div>
          <div className="mt-1 font-card text-base uppercase leading-none tracking-[0.3em] text-white/95">
            Deal
          </div>
        </div>
      </div>

      <header className="flex flex-col items-center gap-2">
        <Wordmark size="lg" />
        <p className="font-display text-base italic text-[var(--color-ink-soft)]">
          A friendly card game of property and ruthless trades.
        </p>
      </header>

      <div className="flex w-full max-w-sm flex-col gap-5">
        {/* Have a code? — secondary entrypoint, sits above the divider. */}
        <section className="surface-paper-warm flex flex-col gap-2 rounded-2xl p-4 text-left">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-ink-soft)]">
            Have a code?
          </p>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              onJoin();
            }}
          >
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="XXXX"
              maxLength={6}
              autoComplete="off"
              className="h-11 min-w-0 flex-1 rounded-full border border-[var(--color-ink)]/15 bg-white px-4 text-center font-mono text-lg tracking-[0.4em] text-[var(--color-ink)] outline-none transition focus:border-[var(--color-accent)]"
              data-testid="code-input"
            />
            <Button
              type="submit"
              variant="secondary"
              disabled={busy || !code.trim()}
              data-testid="join-room"
            >
              Join
            </Button>
          </form>
        </section>

        <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-[var(--color-ink-faint)]">
          <span className="h-px flex-1 bg-[var(--color-ink)]/15" />
          or start a new game
          <span className="h-px flex-1 bg-[var(--color-ink)]/15" />
        </div>

        <label className="flex flex-col gap-1.5 text-left text-sm font-semibold text-[var(--color-ink)]">
          Your name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Player"
            maxLength={24}
            className="h-11 rounded-full border border-[var(--color-ink)]/15 bg-white px-4 text-base text-[var(--color-ink)] outline-none transition focus:border-[var(--color-accent)]"
            data-testid="name-input"
          />
        </label>

        <Button
          onClick={onCreate}
          disabled={busy}
          variant="primary"
          size="lg"
          fullWidth
          data-testid="create-room"
        >
          {busy ? "Creating…" : "Create game"}
        </Button>

        {error && (
          <p className="text-sm font-medium text-[var(--color-accent)]" role="alert">
            {error}
          </p>
        )}
      </div>
    </main>
  );
}
