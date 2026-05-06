"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/Button";
import { Wordmark } from "@/components/ui/Wordmark";
import { getWorkerOrigin } from "@/lib/config";
import {
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
      {/* Decorative card stack — three rotated cards floating with Balatro-grade
          shadows. The top card mimics the canonical Monopoly Deal red back. */}
      <div aria-hidden className="relative h-36 w-44">
        <div className="absolute left-1/2 top-1/2 h-full w-full -translate-x-1/2 -translate-y-1/2 rotate-[-9deg] rounded-xl border-[1.5px] border-[var(--color-set-dark-blue)]/55 bg-gradient-to-br from-[var(--color-set-dark-blue)] to-[#1a3680] shadow-[0_18px_40px_-12px_rgba(0,0,0,0.45)]" />
        <div className="absolute left-1/2 top-1/2 h-full w-full -translate-x-1/2 -translate-y-1/2 rotate-[5deg] rounded-xl border-[1.5px] border-[var(--color-set-green)]/55 bg-gradient-to-br from-[var(--color-set-green)] to-[#1f6b3b] shadow-[0_18px_40px_-12px_rgba(0,0,0,0.45)]" />
        <div className="absolute left-1/2 top-1/2 flex h-full w-full -translate-x-1/2 -translate-y-1/2 rotate-[-1deg] flex-col items-center justify-center gap-2 overflow-hidden rounded-xl border-[1.5px] border-[#7a1d1d] bg-[var(--color-accent)] shadow-[0_22px_50px_-14px_rgba(0,0,0,0.55)]">
          {/* Diagonal stripe overlay */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-25"
            style={{
              backgroundImage:
                "repeating-linear-gradient(45deg, rgba(255,255,255,0.22) 0 2px, transparent 2px 8px)",
            }}
          />
          {/* Centered MONOPOLY mark */}
          <svg viewBox="0 0 100 22" className="relative z-10 h-5 w-auto" aria-hidden>
            <rect width="100" height="22" rx="2" fill="#0A0A0A" />
            <rect x="1.2" y="1.2" width="97.6" height="19.6" rx="1.6" fill="#FFFFFF" />
            <rect x="2.6" y="2.6" width="94.8" height="16.8" rx="1.2" fill="var(--color-accent)" />
            <text
              x="50"
              y="11.5"
              textAnchor="middle"
              dominantBaseline="central"
              fontFamily="var(--font-sans)"
              fontWeight="900"
              fontSize="11"
              letterSpacing="0.4"
              fill="#FFFFFF"
            >
              MONOPOLY
            </text>
          </svg>
          <div className="relative z-10 font-sans text-base font-bold uppercase tracking-[0.32em] text-white">
            Deal
          </div>
        </div>
      </div>

      <header className="flex flex-col items-center gap-3">
        <Wordmark size="lg" />
        <p className="font-display text-base font-normal text-[var(--color-ink-soft)]">
          A friendly card game of property and ruthless trades.
        </p>
      </header>

      <div className="flex w-full max-w-sm flex-col gap-5">
        {/* Have a code? — secondary entrypoint, sits above the divider. */}
        <section className="surface-tint flex flex-col gap-2 rounded-2xl p-4 text-left">
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
              className="tabular h-11 min-w-0 flex-1 rounded-full border-[1.5px] border-[var(--color-ink)]/15 bg-white px-4 text-center font-display text-lg font-bold tracking-[0.4em] text-[var(--color-ink)] outline-none transition focus:border-[var(--color-accent)]"
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
            className="h-11 rounded-full border-[1.5px] border-[var(--color-ink)]/15 bg-white px-4 text-base text-[var(--color-ink)] outline-none transition focus:border-[var(--color-accent)]"
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
