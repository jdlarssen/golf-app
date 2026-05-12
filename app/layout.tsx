import type { Metadata, Viewport } from "next";
import { Fraunces, Inter } from "next/font/google";
import "./globals.css";
import { PwaBoot } from "@/components/PwaBoot";
import { IosInstallHint } from "@/components/IosInstallHint";
import { PerfHud } from "@/components/PerfHud";

// Inter — body, UI labels, forms. Variable font for crisp small-size rendering.
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin", "latin-ext"],
  display: "swap",
});

// Fraunces — display serif for h1/h2, brand mark, and big numbers on the
// leaderboard. Includes the Norwegian glyphs we need (ø, å, æ, Ø, Å, Æ).
// `opsz` is the only extra axis we want — SOFT/WONK introduce the very
// ornament the brand foundations reject ("restraint over ornament").
const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin", "latin-ext"],
  display: "swap",
  axes: ["opsz"],
});

export const metadata: Metadata = {
  title: "Tørny",
  description: "Turneringsapp for golf — for kompiser og klubber",
  applicationName: "Tørny",
  appleWebApp: {
    capable: true,
    title: "Tørny",
    statusBarStyle: "default",
  },
  formatDetection: {
    telephone: false,
  },
};

// Next.js 16 requires themeColor / colorScheme / viewport in a separate
// `viewport` export — they are deprecated under `metadata`.
// Dark mode is deferred — see TODO.md. Force light across the app for now
// so OS dark mode doesn't show half-finished tokens.
export const viewport: Viewport = {
  themeColor: "#1b4332",
  colorScheme: "light",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="nb-NO"
      data-theme="light"
      className={`${inter.variable} ${fraunces.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans">
        {children}
        <IosInstallHint />
        <PwaBoot />
        <PerfHud />
      </body>
    </html>
  );
}
