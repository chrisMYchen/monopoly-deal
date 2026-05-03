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

// Per-color confetti palettes — tuned to land vibrantly on the warm parchment
// background. Each palette includes a darker base, a punchy mid, and a cream
// highlight so the burst reads as fireworks rather than scattered confetti.
const COLOR_PALETTE: Record<string, string[]> = {
  brown: ["#8B5A2B", "#B57A3F", "#FAEFD2"],
  lightBlue: ["#6FB6D9", "#A5D5EE", "#FAF4E8"],
  pink: ["#D9568F", "#F19BC0", "#FAF4E8"],
  orange: ["#ED7C2A", "#F5A56A", "#FAF4E8"],
  red: ["#CC2E2E", "#E27272", "#FAF4E8"],
  yellow: ["#E6B82A", "#F2D472", "#FAF4E8"],
  green: ["#2C8E50", "#5DB57E", "#FAF4E8"],
  darkBlue: ["#2A4FB0", "#6E89D6", "#FAF4E8"],
  railroad: ["#1F1F1F", "#5C5C5C", "#FAF4E8"],
  utility: ["#B0C436", "#D2DE7A", "#FAF4E8"],
  // Win: the brand palette — gold + coral + mint + parchment highlight.
  win: ["#E0B341", "#C8531A", "#2F8F70", "#0F2A2E", "#FAF4E8"],
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
