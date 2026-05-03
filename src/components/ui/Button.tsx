"use client";

// Tactile button — every CTA in the app routes through this. Shape is always
// pill (rounded-full); the variant controls fill / ink / shadow. The press
// depth (sticker shadow → press shadow + 2px translate) gives the button a
// physical feel without ever blocking input.
//
// Variants line up to the design language:
//   primary  — coral fill on cream ink, the "do it" CTA
//   secondary — paper fill, deep teal border + ink, the "ok / cancel" CTA
//   ghost    — no fill, deep teal ink, used for affordances and toggles
//   danger   — coral outline that warms on hover
//   inked    — deep teal fill on cream ink, used inside paper panels for emphasis
//
// Sizes:
//   sm    — h-9 (pills, top banner widgets)
//   md    — h-11 (default)
//   lg    — h-14, larger type, thicker shadow (signature CTAs like Lobby Start)

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "inked";
type Size = "sm" | "md" | "lg";

const VARIANT: Record<Variant, string> = {
  primary:
    "bg-[var(--color-accent)] text-[var(--color-ink-inverse)] hover:bg-[var(--color-accent-hot)] btn-sticker disabled:bg-[var(--color-bg-tint)] disabled:text-[var(--color-ink-faint)] disabled:shadow-none",
  secondary:
    "bg-[var(--color-paper)] text-[var(--color-ink)] border border-[var(--color-ink)]/15 hover:bg-[var(--color-paper-warm)] btn-sticker disabled:bg-[var(--color-bg-tint)] disabled:text-[var(--color-ink-faint)] disabled:shadow-none",
  ghost:
    "bg-transparent text-[var(--color-ink)] hover:bg-[var(--color-ink)]/8 disabled:text-[var(--color-ink-faint)]",
  danger:
    "bg-transparent text-[var(--color-accent)] border border-[var(--color-accent)]/40 hover:bg-[var(--color-accent)] hover:text-[var(--color-ink-inverse)] btn-sticker",
  inked:
    "bg-[var(--color-inked)] text-[var(--color-ink-inverse)] hover:bg-[var(--color-inked-soft)] btn-sticker disabled:opacity-60",
};

const SIZE: Record<Size, string> = {
  sm: "h-9 px-3 text-sm",
  md: "h-11 px-5 text-[15px]",
  lg: "h-14 px-7 text-lg font-semibold",
};

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  fullWidth?: boolean;
  // Render the inner content inside a <span> so the press transform doesn't
  // affect children that need their own positioning (e.g. icons + text).
  iconLeading?: ReactNode;
  iconTrailing?: ReactNode;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "primary",
    size = "md",
    fullWidth,
    iconLeading,
    iconTrailing,
    children,
    className,
    type,
    ...rest
  },
  ref,
) {
  const cls = [
    "inline-flex items-center justify-center gap-2 rounded-full font-semibold whitespace-nowrap select-none",
    "disabled:cursor-not-allowed",
    VARIANT[variant],
    SIZE[size],
    fullWidth ? "w-full" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <button ref={ref} type={type ?? "button"} className={cls} {...rest}>
      {iconLeading}
      {children}
      {iconTrailing}
    </button>
  );
});
