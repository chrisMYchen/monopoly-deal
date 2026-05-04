// Procedural SFX via Web Audio API. Zero file dependencies — every sound is
// synthesized at play time from oscillators + filters + gain envelopes. Each
// effect is short (≤350ms) and pre-mixed for parity with the others.
//
// Respects the global mute toggle (preferences.ts) and the autoplay-unlock
// gate. Decorative only — fire-and-forget; never await; swallow all errors.

import { isAudioMuted, isAudioUnlocked, markAudioUnlocked } from "./preferences";

export type SfxKey =
  | "cardPlay"
  | "moneyPickup"
  | "setComplete"
  | "theft"
  | "clash"
  | "pay"
  | "turn"
  | "win"
  | "wildFlip"
  | "handOverflow";

let ctx: AudioContext | null = null;
let masterGain: GainNode | null = null;

function ensureCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (ctx) return ctx;
  // Safari prefix.
  const Ctor: typeof AudioContext | undefined =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  try {
    ctx = new Ctor();
    masterGain = ctx.createGain();
    masterGain.gain.value = 0.65;
    masterGain.connect(ctx.destination);
  } catch {
    return null;
  }
  return ctx;
}

function envGain(ac: AudioContext, attack: number, decay: number, peak = 1): GainNode {
  const g = ac.createGain();
  const t0 = ac.currentTime;
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(peak, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
  return g;
}

function tone(
  ac: AudioContext,
  type: OscillatorType,
  freq: number | { from: number; to: number; ramp?: "linear" | "exponential" },
  attack: number,
  decay: number,
  peak: number,
  destination: AudioNode,
): void {
  const osc = ac.createOscillator();
  osc.type = type;
  const env = envGain(ac, attack, decay, peak);
  osc.connect(env).connect(destination);
  if (typeof freq === "number") {
    osc.frequency.value = freq;
  } else {
    osc.frequency.setValueAtTime(freq.from, ac.currentTime);
    if (freq.ramp === "exponential") {
      osc.frequency.exponentialRampToValueAtTime(freq.to, ac.currentTime + attack + decay);
    } else {
      osc.frequency.linearRampToValueAtTime(freq.to, ac.currentTime + attack + decay);
    }
  }
  osc.start();
  osc.stop(ac.currentTime + attack + decay + 0.05);
}

function noiseBurst(
  ac: AudioContext,
  duration: number,
  filterFreq: number,
  q: number,
  peak: number,
  destination: AudioNode,
): void {
  const buffer = ac.createBuffer(1, Math.max(1, Math.floor(ac.sampleRate * duration)), ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = ac.createBufferSource();
  src.buffer = buffer;
  const filter = ac.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = filterFreq;
  filter.Q.value = q;
  const env = envGain(ac, 0.005, duration, peak);
  src.connect(filter).connect(env).connect(destination);
  src.start();
  src.stop(ac.currentTime + duration + 0.02);
}

function play(key: SfxKey, volumeScale: number): void {
  const ac = ensureCtx();
  if (!ac || !masterGain) return;
  const dest = ac.createGain();
  dest.gain.value = volumeScale;
  dest.connect(masterGain);

  switch (key) {
    case "cardPlay":
      noiseBurst(ac, 0.08, 1500, 4, 0.35, dest);
      tone(ac, "triangle", { from: 320, to: 220 }, 0.005, 0.07, 0.18, dest);
      break;
    case "moneyPickup":
      tone(ac, "sine", { from: 760, to: 1180, ramp: "exponential" }, 0.005, 0.12, 0.32, dest);
      tone(ac, "sine", { from: 1180, to: 1480, ramp: "exponential" }, 0.04, 0.1, 0.22, dest);
      break;
    case "setComplete": {
      // Major triad arpeggio — C5, E5, G5 — quick.
      const notes = [523.25, 659.26, 783.99];
      notes.forEach((f, i) => {
        window.setTimeout(() => {
          const ac2 = ensureCtx();
          if (!ac2 || !masterGain) return;
          const d2 = ac2.createGain();
          d2.gain.value = volumeScale;
          d2.connect(masterGain);
          tone(ac2, "triangle", f, 0.01, 0.32, 0.32, d2);
          tone(ac2, "sine", f * 2, 0.01, 0.18, 0.12, d2);
        }, i * 90);
      });
      break;
    }
    case "theft": {
      tone(ac, "sawtooth", { from: 720, to: 180, ramp: "exponential" }, 0.01, 0.22, 0.28, dest);
      noiseBurst(ac, 0.18, 800, 6, 0.18, dest);
      break;
    }
    case "clash": {
      noiseBurst(ac, 0.16, 2200, 3, 0.5, dest);
      tone(ac, "square", { from: 320, to: 80, ramp: "exponential" }, 0.005, 0.12, 0.3, dest);
      break;
    }
    case "pay": {
      // Two quick metallic ticks.
      noiseBurst(ac, 0.06, 3200, 8, 0.4, dest);
      window.setTimeout(() => {
        const ac2 = ensureCtx();
        if (!ac2 || !masterGain) return;
        const d2 = ac2.createGain();
        d2.gain.value = volumeScale * 0.85;
        d2.connect(masterGain);
        noiseBurst(ac2, 0.06, 2600, 8, 0.35, d2);
        tone(ac2, "sine", 1200, 0.005, 0.12, 0.18, d2);
      }, 70);
      break;
    }
    case "turn":
      tone(ac, "sine", 880, 0.005, 0.18, 0.28, dest);
      tone(ac, "sine", 1320, 0.01, 0.22, 0.12, dest);
      break;
    case "wildFlip": {
      // Quick paper-flip tick + tiny pitch lift. Distinct from generic cardPlay
      // so reassigning a wildcard between color halves feels physical.
      noiseBurst(ac, 0.04, 4200, 10, 0.32, dest);
      tone(ac, "triangle", { from: 540, to: 760, ramp: "exponential" }, 0.005, 0.06, 0.16, dest);
      break;
    }
    case "handOverflow": {
      // Soft acknowledgment when discard-to-limit prompt appears. Two-note
      // gentle descent — "you have a thing to do" without scolding.
      tone(ac, "sine", 520, 0.01, 0.14, 0.18, dest);
      window.setTimeout(() => {
        const ac2 = ensureCtx();
        if (!ac2 || !masterGain) return;
        const d2 = ac2.createGain();
        d2.gain.value = volumeScale * 0.85;
        d2.connect(masterGain);
        tone(ac2, "sine", 392, 0.01, 0.18, 0.16, d2);
      }, 90);
      break;
    }
    case "win": {
      // Triumphant: ascending arp + held final chord.
      const arp = [392, 523.25, 659.26, 784, 988];
      arp.forEach((f, i) => {
        window.setTimeout(() => {
          const ac2 = ensureCtx();
          if (!ac2 || !masterGain) return;
          const d2 = ac2.createGain();
          d2.gain.value = volumeScale;
          d2.connect(masterGain);
          tone(ac2, "triangle", f, 0.01, 0.22, 0.34, d2);
          tone(ac2, "sine", f * 2, 0.01, 0.16, 0.14, d2);
        }, i * 110);
      });
      // Final held chord.
      window.setTimeout(() => {
        const ac2 = ensureCtx();
        if (!ac2 || !masterGain) return;
        const d2 = ac2.createGain();
        d2.gain.value = volumeScale * 0.9;
        d2.connect(masterGain);
        [523.25, 659.26, 783.99, 1046.5].forEach((f) =>
          tone(ac2, "triangle", f, 0.04, 0.6, 0.16, d2),
        );
      }, arp.length * 110);
      break;
    }
  }
}

export function playSfx(key: SfxKey, volumeScale = 1): void {
  if (typeof window === "undefined") return;
  if (isAudioMuted()) return;
  if (!isAudioUnlocked()) return;
  try {
    play(key, Math.max(0, Math.min(1.5, volumeScale)));
  } catch {
    // Never let audio failures bubble.
  }
}

// Wire the audio unlock gate to the next user gesture. Safari requires the
// AudioContext to be created or resumed inside a real gesture, so we both
// flip our flag and explicitly resume() the context here.
export function attachAudioUnlock(): void {
  if (typeof window === "undefined") return;
  if (isAudioUnlocked()) return;
  const unlock = () => {
    const ac = ensureCtx();
    if (ac && ac.state === "suspended") {
      ac.resume().catch(() => undefined);
    }
    markAudioUnlocked();
    window.removeEventListener("pointerdown", unlock);
    window.removeEventListener("keydown", unlock);
    window.removeEventListener("touchstart", unlock);
  };
  window.addEventListener("pointerdown", unlock, { once: true });
  window.addEventListener("keydown", unlock, { once: true });
  window.addEventListener("touchstart", unlock, { once: true });
}
