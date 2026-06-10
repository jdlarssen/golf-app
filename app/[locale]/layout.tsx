import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { Fraunces, Inter } from "next/font/google";
import { notFound } from "next/navigation";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { routing } from "@/i18n/routing";
import "../globals.css";
import { PwaBoot } from "@/components/PwaBoot";
import { InstallPromptCapture } from "@/components/pwa/InstallPromptCapture";
import { PerfHud } from "@/components/PerfHud";
import { BottomNavGate } from "@/components/ui/BottomNavGate";

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

// Prerender a static shell per locale (PPR under cacheComponents — the
// [locale] param is part of the cache key via next/root-params, see
// i18n/request.ts).
export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

type Props = {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
};

// App name comes from the message catalog — proves catalog loading is wired
// end-to-end (#475 Fase 0) while output stays byte-identical to before.
export async function generateMetadata({
  params,
}: Pick<Props, "params">): Promise<Metadata> {
  const { locale } = await params;
  const resolved = hasLocale(routing.locales, locale)
    ? locale
    : routing.defaultLocale;
  const t = await getTranslations({ locale: resolved, namespace: "common" });
  return {
    title: t("appName"),
    description: "Turneringsapp for golf — for kompiser og klubber",
    applicationName: t("appName"),
    appleWebApp: {
      capable: true,
      title: t("appName"),
      statusBarStyle: "default",
    },
    formatDetection: {
      telephone: false,
    },
  };
}

// Next.js 16 requires themeColor / colorScheme / viewport in a separate
// `viewport` export — they are deprecated under `metadata`.
export const viewport: Viewport = {
  themeColor: "#1b4332",
  colorScheme: "light dark",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({ children, params }: Props) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  // Vedvarende bunn-nav (#355): rendret én gang globalt så den dekker ALLE
  // innloggede spiller-flater — inkludert de ~30 format-spesifikke leaderboard-
  // viewene som hver eier sin egen AppShell. BottomNavGate leser proxy-headeren
  // (runtime-API) og må derfor streames bak Suspense (#538) — kjørte den i selve
  // layouten, fikk ingen rute statisk skall. BottomNav skjuler seg selv på
  // admin + hull-skjerm via usePathname.
  return (
    <html
      lang={locale}
      className={`${inter.variable} ${fraunces.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans">
        <NextIntlClientProvider>
          {children}
          <Suspense fallback={null}>
            <BottomNavGate />
          </Suspense>
          <InstallPromptCapture />
          <PwaBoot />
          {/* usePathname() er runtime-data under cacheComponents — må streames
              bak Suspense for ikke å blokkere det statiske skallet (#538). */}
          <Suspense fallback={null}>
            <PerfHud />
          </Suspense>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
