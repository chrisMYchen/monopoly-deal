// Per-action SVG illustrations. Each component is a 64x64 viewBox SVG that
// fills its parent — paint is currentColor so the parent can theme via
// `text-white/90` etc. White-line art on solid colored card backgrounds
// (set per action via CSS variables) is what gives action cards their distinct
// "this is THAT card" feel without needing 11 raster assets.

import type { ActionKind } from "@/engine/cards";
import type { ComponentType, SVGProps } from "react";

type ArtProps = SVGProps<SVGSVGElement>;

function Frame({ children, ...rest }: ArtProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      stroke="currentColor"
      strokeWidth={3}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...rest}
    >
      {children}
    </svg>
  );
}

// Three stacked property tiles being pulled away by an arrow.
function DealBreakerArt(props: ArtProps) {
  return (
    <Frame {...props}>
      <rect x="10" y="14" width="26" height="8" rx="1.5" fill="currentColor" opacity="0.55" />
      <rect x="10" y="26" width="26" height="8" rx="1.5" fill="currentColor" opacity="0.75" />
      <rect x="10" y="38" width="26" height="8" rx="1.5" fill="currentColor" />
      <path d="M40 30 L54 30 M48 24 L54 30 L48 36" />
    </Frame>
  );
}

// Stop sign / no-entry: octagon with diagonal bar.
function JustSayNoArt(props: ArtProps) {
  return (
    <Frame {...props}>
      <path d="M22 10 H42 L54 22 V42 L42 54 H22 L10 42 V22 Z" fill="currentColor" opacity="0.18" />
      <path d="M22 10 H42 L54 22 V42 L42 54 H22 L10 42 V22 Z" />
      <path d="M18 18 L46 46" strokeWidth="5" />
    </Frame>
  );
}

// A reaching hand pinching a single card — Mr. Monopoly's top hat hovers
// above as a canonical "thief in a top hat" wink.
function SlyDealArt(props: ArtProps) {
  return (
    <Frame {...props}>
      {/* Floating top hat — IP nod */}
      <ellipse cx="20" cy="20" rx="11" ry="1.4" fill="currentColor" opacity="0.6" />
      <rect x="13" y="10" width="14" height="10" rx="0.6" fill="currentColor" opacity="0.5" />
      {/* Card being lifted */}
      <rect x="34" y="14" width="20" height="28" rx="2" fill="currentColor" opacity="0.25" />
      <rect x="34" y="14" width="20" height="28" rx="2" />
      {/* Reaching hand */}
      <path d="M14 42 C 14 34, 22 32, 26 36 L 30 40" />
      <path d="M22 48 C 22 42, 28 40, 32 44 L 36 46" />
      <path d="M14 42 L14 54 L36 54 L36 46" />
    </Frame>
  );
}

// Two cards swapping (curved arrows).
function ForcedDealArt(props: ArtProps) {
  return (
    <Frame {...props}>
      <rect x="8" y="14" width="18" height="24" rx="2" fill="currentColor" opacity="0.25" />
      <rect x="8" y="14" width="18" height="24" rx="2" />
      <rect x="38" y="26" width="18" height="24" rx="2" fill="currentColor" opacity="0.45" />
      <rect x="38" y="26" width="18" height="24" rx="2" />
      <path d="M28 22 C 36 22, 36 16, 44 16" />
      <path d="M40 12 L44 16 L40 20" />
      <path d="M36 42 C 28 42, 28 48, 20 48" />
      <path d="M24 52 L20 48 L24 44" />
    </Frame>
  );
}

// Stack of bills being grabbed.
function DebtCollectorArt(props: ArtProps) {
  return (
    <Frame {...props}>
      <rect x="12" y="20" width="36" height="20" rx="2" fill="currentColor" opacity="0.2" />
      <rect x="12" y="20" width="36" height="20" rx="2" />
      <circle cx="30" cy="30" r="5" />
      <text
        x="30"
        y="33.5"
        textAnchor="middle"
        fontFamily="var(--font-card)"
        fontSize="10"
        stroke="none"
        fill="currentColor"
      >
        $
      </text>
      <path d="M14 46 L46 46" />
      <path d="M16 50 L44 50" opacity="0.6" />
    </Frame>
  );
}

// Birthday cake with candle.
function BirthdayArt(props: ArtProps) {
  return (
    <Frame {...props}>
      <path d="M30 10 L30 18" />
      <path d="M30 8 C 28 11, 28 13, 30 14 C 32 13, 32 11, 30 8 Z" fill="currentColor" />
      <rect x="14" y="22" width="32" height="10" rx="1" fill="currentColor" opacity="0.35" />
      <path d="M14 26 C 18 22, 22 30, 26 26 C 30 22, 34 30, 38 26 C 42 22, 46 30, 46 30" />
      <rect x="10" y="32" width="40" height="18" rx="2" fill="currentColor" opacity="0.2" />
      <rect x="10" y="32" width="40" height="18" rx="2" />
      <path d="M10 40 L50 40" opacity="0.5" />
    </Frame>
  );
}

// Bold ×2 multiplier.
function DoubleRentArt(props: ArtProps) {
  return (
    <Frame {...props}>
      <text
        x="32"
        y="42"
        textAnchor="middle"
        fontFamily="var(--font-card)"
        fontSize="32"
        stroke="none"
        fill="currentColor"
      >
        ×2
      </text>
      <path d="M14 50 L50 50" opacity="0.4" />
    </Frame>
  );
}

// Canonical green-house silhouette — pitched roof + chimney, matches
// HouseIcon used elsewhere in the UI.
function HouseArt(props: ArtProps) {
  return (
    <Frame {...props}>
      <path d="M12 30 L32 12 L52 30 L48 30 L48 52 L16 52 L16 30 Z" fill="currentColor" opacity="0.25" />
      <path d="M12 30 L32 12 L52 30 L48 30 L48 52 L16 52 L16 30 Z" />
      {/* Chimney */}
      <rect x="40" y="14" width="5" height="9" fill="currentColor" opacity="0.8" />
      {/* Door */}
      <rect x="28" y="38" width="8" height="14" />
    </Frame>
  );
}

// Canonical red-hotel silhouette — wide low-pitch roof + two chimneys,
// matches HotelIcon used elsewhere in the UI.
function HotelArt(props: ArtProps) {
  return (
    <Frame {...props}>
      <path d="M6 24 L32 12 L58 24 L54 24 L54 52 L10 52 L10 24 Z" fill="currentColor" opacity="0.22" />
      <path d="M6 24 L32 12 L58 24 L54 24 L54 52 L10 52 L10 24 Z" />
      {/* Two chimneys */}
      <rect x="16" y="14" width="5" height="9" fill="currentColor" opacity="0.8" />
      <rect x="42" y="14" width="5" height="9" fill="currentColor" opacity="0.8" />
      {/* Door */}
      <rect x="28" y="38" width="8" height="14" />
      {/* Two windows */}
      <rect x="16" y="30" width="7" height="6" />
      <rect x="40" y="30" width="7" height="6" />
    </Frame>
  );
}

// "GO" corner with a directional arrow.
function PassGoArt(props: ArtProps) {
  return (
    <Frame {...props}>
      <rect x="10" y="10" width="44" height="44" rx="3" fill="currentColor" opacity="0.18" />
      <rect x="10" y="10" width="44" height="44" rx="3" />
      <text
        x="32"
        y="36"
        textAnchor="middle"
        fontFamily="var(--font-card)"
        fontSize="18"
        stroke="none"
        fill="currentColor"
      >
        GO
      </text>
      <path d="M18 46 L46 46" />
      <path d="M40 42 L46 46 L40 50" />
    </Frame>
  );
}

// House with $ — rent demand.
function RentArt(props: ArtProps) {
  return (
    <Frame {...props}>
      <path d="M14 30 L32 16 L50 30 L50 50 L14 50 Z" fill="currentColor" opacity="0.2" />
      <path d="M14 30 L32 16 L50 30 L50 50 L14 50 Z" />
      <text
        x="32"
        y="44"
        textAnchor="middle"
        fontFamily="var(--font-card)"
        fontSize="16"
        stroke="none"
        fill="currentColor"
      >
        $
      </text>
    </Frame>
  );
}

export const ACTION_ART: Record<ActionKind, ComponentType<ArtProps>> = {
  dealBreaker: DealBreakerArt,
  justSayNo: JustSayNoArt,
  slyDeal: SlyDealArt,
  forcedDeal: ForcedDealArt,
  debtCollector: DebtCollectorArt,
  birthday: BirthdayArt,
  doubleRent: DoubleRentArt,
  house: HouseArt,
  hotel: HotelArt,
  passGo: PassGoArt,
  rent: RentArt,
};

// Per-action card-face theme. `bg` is the saturated background color,
// `fg` is the white-block text color, `art` is the illustration tint.
export const ACTION_THEME: Record<ActionKind, { bg: string; ink: string }> = {
  dealBreaker: { bg: "var(--color-action-deal-breaker)", ink: "#1a1209" },
  justSayNo: { bg: "var(--color-action-just-say-no)", ink: "#ffffff" },
  slyDeal: { bg: "var(--color-action-sly-deal)", ink: "#ffffff" },
  forcedDeal: { bg: "var(--color-action-forced-deal)", ink: "#ffffff" },
  debtCollector: { bg: "var(--color-action-debt-collector)", ink: "#ffffff" },
  birthday: { bg: "var(--color-action-birthday)", ink: "#ffffff" },
  doubleRent: { bg: "var(--color-action-double-rent)", ink: "#ffffff" },
  house: { bg: "var(--color-action-house)", ink: "#ffffff" },
  hotel: { bg: "var(--color-action-hotel)", ink: "#ffffff" },
  passGo: { bg: "var(--color-action-pass-go)", ink: "#ffffff" },
  rent: { bg: "var(--color-action-rent)", ink: "#1a1209" },
};
