import type { Metadata, Viewport } from "next";
import { Anton, Fraunces, Inter_Tight, JetBrains_Mono } from "next/font/google";
import "./globals.css";

// Card titles only — canon-faithful condensed caps for property + action
// names. Kept from before; the rest of the type system has moved on.
const card = Anton({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-card",
  display: "swap",
});

// Display: Fraunces (variable serif w/ optical sizing). Used for screen
// headlines, the wordmark, and dialog titles. Carries the brand's voice.
const display = Fraunces({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
  axes: ["opsz", "SOFT", "WONK"],
});

// Body UI font. Inter Tight reads slightly chunkier + warmer than Inter.
const sans = Inter_Tight({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

// Mono — used for dense numerics (room codes, $XM, hand counts).
const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Monopoly Deal",
  description: "A friendly card game of property, rent, and ruthless trades.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#FAF4E8",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${display.variable} ${sans.variable} ${card.variable} ${mono.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
