"use client";

// Tactile button — every CTA in the app routes through this. Flat fills,
// NO drop shadows on chrome (NYT discipline). Press = darken background,
// no transform. Cards are the only thing in the app that floats.
//
// Variants:
//   primary   — solid Monopoly red, white ink (the main CTA)
//   secondary — white fill, ink border (the alternate)
//   ghost     — transparent + ink, hover tint (toggles, dismissals)
//   inked     — felt fill + white ink (used INSIDE the felt panel for emphasis)
//   danger    — red outline, fills red on hover
//
// Sizes:
//   sm — h-9
//   md — h-11 (default)
//   lg — h-14, larger type, signature CTAs

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "inked" | "danger";
type Size = "sm" | "md" | "lg";

const VARIANT: Record<Variant, string> = {
  primary:
    "bg-[var(--color-accent)] text-[var(--color-ink-on-dark)] hover:bg-[var(--color-accent-deep)] active:bg-[var(--color-accent-deep)] disabled:bg-[var(--color-tint)] disabled:text-[var(--color-ink-faint)]",
  secondary:
    "bg-[var(--color-card)] text-[var(--color-ink)] border-[1.5px] border-[var(--color-ink)] hover:bg-[var(--color-tint)] active:bg-[var(--color-tint)] disabled:border-[var(--color-ink-faint)] disabled:text-[var(--color-ink-faint)]",
  ghost:
    "bg-transparent text-[var(--color-ink)] hover:bg-[var(--color-tint)] active:bg-[var(--color-tint)] disabled:text-[var(--color-ink-faint)]",
  inked:
    "bg-[color-mix(in_oklab,var(--color-felt)_88%,white)] text-[var(--color-ink-on-dark)] hover:bg-[color-mix(in_oklab,var(--color-felt)_75%,white)] disabled:opacity-60",
  danger:
    "bg-transparent text-[var(--color-accent)] border-[1.5px] border-[var(--color-accent)] hover:bg-[var(--color-accent)] hover:text-[var(--color-ink-on-dark)]",
};

const SIZE: Record<Size, string> = {
  sm: "h-9 px-3.5 text-sm",
  md: "h-11 px-5 text-[15px]",
  lg: "h-14 px-7 text-lg",
};

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  fullWidth?: boolean;
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
    "transition-colors duration-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]",
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
