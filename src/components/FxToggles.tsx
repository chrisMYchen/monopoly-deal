"use client";

// Small icon cluster for muting sound + disabling haptics. Persists to
// localStorage via preferences.ts. Lives in the TopBanner so it's always
// reachable without occluding the action bar.

import { useEffect, useState } from "react";

import {
  isAudioMuted,
  isHapticsDisabled,
  setAudioMuted,
  setHapticsDisabled,
  subscribePreferences,
} from "@/lib/animations/preferences";

function useHasVibrate(): boolean {
  const [has, setHas] = useState(false);
  useEffect(() => {
    setHas(typeof navigator !== "undefined" && typeof navigator.vibrate === "function");
  }, []);
  return has;
}

export function FxToggles() {
  const [muted, setMuted] = useState(false);
  const [hapticOff, setHapticOff] = useState(false);
  const hasVibrate = useHasVibrate();

  useEffect(() => {
    setMuted(isAudioMuted());
    setHapticOff(isHapticsDisabled());
    return subscribePreferences(() => {
      setMuted(isAudioMuted());
      setHapticOff(isHapticsDisabled());
    });
  }, []);

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => setAudioMuted(!muted)}
        title={muted ? "Sound off — tap to enable" : "Sound on — tap to mute"}
        aria-label={muted ? "Enable sound" : "Mute sound"}
        aria-pressed={!muted}
        className="rounded-full border border-white/15 px-1.5 py-0.5 text-[11px] opacity-80 transition hover:bg-white/10 hover:opacity-100"
      >
        {muted ? "🔇" : "🔊"}
      </button>
      {hasVibrate && (
        <button
          type="button"
          onClick={() => setHapticsDisabled(!hapticOff)}
          title={hapticOff ? "Haptics off — tap to enable" : "Haptics on — tap to disable"}
          aria-label={hapticOff ? "Enable haptics" : "Disable haptics"}
          aria-pressed={!hapticOff}
          className={[
            "rounded-full border border-white/15 px-1.5 py-0.5 text-[11px] transition hover:bg-white/10",
            hapticOff ? "opacity-40 line-through" : "opacity-80 hover:opacity-100",
          ].join(" ")}
        >
          📳
          <span className="sr-only">{hapticOff ? "Haptics off" : "Haptics on"}</span>
        </button>
      )}
    </div>
  );
}
