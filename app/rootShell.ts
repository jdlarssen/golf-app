import type { Viewport } from "next";
import { Fraunces, Inter } from "next/font/google";

// The document shell both root documents share (#2292): the `[locale]` layout
// and `app/global-not-found.tsx`, which renders outside that layout and so
// inherits nothing from it. One font definitions file, per the next/font docs,
// so each font is hosted once.

// Inter — body, UI labels, forms. Variable font for crisp small-size rendering.
export const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin", "latin-ext"],
  display: "swap",
});

// Fraunces — display serif for h1/h2, brand mark, and big numbers on the
// leaderboard. Includes the Norwegian glyphs we need (ø, å, æ, Ø, Å, Æ).
// `opsz` is the only extra axis we want — SOFT/WONK introduce the very
// ornament the brand foundations reject ("restraint over ornament").
export const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin", "latin-ext"],
  display: "swap",
  axes: ["opsz"],
});

// Next.js 16 requires themeColor / colorScheme / viewport in a separate
// `viewport` export — they are deprecated under `metadata`. `viewportFit:
// "cover"` is what AppShell's env(safe-area-inset-bottom) needs.
export const rootViewport: Viewport = {
  themeColor: "#1b4332",
  colorScheme: "light dark",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};
