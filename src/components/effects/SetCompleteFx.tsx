"use client";

// Lights up the just-completed property group with a brief flash + ring pulse
// by adding a CSS class to its DOM node (data-set-color + data-player-id).
// Confetti emission is owned by AnimationLayer; this only handles the local
// glow because the group's bounding box belongs to the tableau, not us.
//
// Pure decoration — pointer-events:none, no DOM mutation that affects layout.

import { useEffect } from "react";

export type SetCompleteFxProps = {
  playerId: string;
  color: string;
  // Called once after the glow class is removed so the dispatcher can clean
  // this effect entry from its TTL list.
  onSettled?: () => void;
};

const FLASH_MS = 900;

export function SetCompleteFx({ playerId, color, onSettled }: SetCompleteFxProps) {
  useEffect(() => {
    const el = document.querySelector<HTMLElement>(
      `[data-player-id="${CSS.escape(playerId)}"][data-set-color="${CSS.escape(color)}"]`,
    );
    if (!el) {
      onSettled?.();
      return;
    }
    el.classList.add("rr-set-complete-flash");
    const tid = window.setTimeout(() => {
      el.classList.remove("rr-set-complete-flash");
      onSettled?.();
    }, FLASH_MS);
    return () => {
      window.clearTimeout(tid);
      el.classList.remove("rr-set-complete-flash");
    };
  }, [playerId, color, onSettled]);
  return null;
}
