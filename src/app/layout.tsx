import type { Metadata, Viewport } from "next";
import { Anton, DM_Sans, Source_Serif_4 } from "next/font/google";
import "./globals.css";

// Card titles only — canon-faithful condensed caps for property + action
// names. Kept across redesigns; the canon stays.
const card = Anton({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-card",
  display: "swap",
});

// Display: Source Serif 4 (variable serif with optical sizing). Used for
// screen headlines, the wordmark "Deal", dialog titles, lobby code. Bold
// editorial weight, NO italics anywhere in the UI.
const display = Source_Serif_4({
  subsets: ["latin"],
  weight: ["400", "600", "700", "800"],
  variable: "--font-display",
  display: "swap",
});

// Body UI font. DM Sans variable axis — quiet humanist sans, supports
// tabular-nums via the .tabular utility for bank totals and rent payments.
// Pairs with Source Serif 4's warmth without the AI-default convergence smell
// of Inter. The variable axis gives us every weight from a single font file
// (smaller payload than 4 static cuts). See DESIGN.md.
const sans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Monopoly Deal",
  description: "A friendly card game of property, rent, and ruthless trades.",
  icons: {
    icon: "/favicon.svg",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#FAFAF7",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${display.variable} ${sans.variable} ${card.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
