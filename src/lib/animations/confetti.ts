// Thin wrapper around canvas-confetti. Uses one shared <canvas> mounted by
// the AnimationLayer so we never spawn multiple stages. Always pointer-events
// none and reduced-motion gated by callers if desired.

import confetti, { type CreateTypes } from "canvas-confetti";

import { prefersReducedMotion } from "./preferences";

let instance: CreateTypes | null = null;

// Wire a canvas into the confetti library. Call once per canvas; repeated
// calls replace the instance (used when the AnimationLayer remounts).
export function attachConfettiCanvas(canvas: HTMLCanvasElement | null): void {
  if (!canvas) {
    instance = null;
    return;
  }
  instance = confetti.create(canvas, { resize: true, useWorker: true });
}

// Pick a subtle but party-coded palette per property color group.
const COLOR_PALETTE: Record<string, string[]> = {
  brown: ["#a16207", "#b45309", "#fde68a"],
  lightBlue: ["#7dd3fc", "#38bdf8", "#e0f2fe"],
  pink: ["#f9a8d4", "#ec4899", "#fce7f3"],
  orange: ["#fb923c", "#f97316", "#fed7aa"],
  red: ["#ef4444", "#dc2626", "#fecaca"],
  yellow: ["#facc15", "#eab308", "#fef08a"],
  green: ["#22c55e", "#16a34a", "#bbf7d0"],
  darkBlue: ["#2563eb", "#1d4ed8", "#bfdbfe"],
  railroad: ["#4b5563", "#1f2937", "#e5e7eb"],
  utility: ["#a3e635", "#84cc16", "#ecfccb"],
  win: ["#facc15", "#fb923c", "#22c55e", "#38bdf8", "#ec4899"],
};

export function burstFromRect(rect: DOMRect, color?: string): void {
  if (!instance) return;
  if (prefersReducedMotion()) return;
  const x = (rect.left + rect.width / 2) / window.innerWidth;
  const y = (rect.top + rect.height / 2) / window.innerHeight;
  const colors = COLOR_PALETTE[color ?? "win"] ?? COLOR_PALETTE.win!;
  instance({
    particleCount: 60,
    spread: 75,
    startVelocity: 38,
    decay: 0.92,
    gravity: 1.1,
    ticks: 200,
    origin: { x, y },
    colors,
    scalar: 0.9,
    disableForReducedMotion: true,
  });
}

// 1.8s rolling burst from two screen-edge origins for the win celebration.
export function winRoll(): void {
  if (!instance) return;
  if (prefersReducedMotion()) return;
  const colors = COLOR_PALETTE.win!;
  const end = Date.now() + 1800;
  const tick = () => {
    if (Date.now() > end) return;
    instance!({
      particleCount: 6,
      angle: 60,
      spread: 70,
      startVelocity: 55,
      origin: { x: 0, y: 0.7 },
      colors,
      disableForReducedMotion: true,
    });
    instance!({
      particleCount: 6,
      angle: 120,
      spread: 70,
      startVelocity: 55,
      origin: { x: 1, y: 0.7 },
      colors,
      disableForReducedMotion: true,
    });
    requestAnimationFrame(tick);
  };
  tick();
}
