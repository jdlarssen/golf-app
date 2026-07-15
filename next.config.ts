import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const pkg = JSON.parse(
  readFileSync(resolve("./package.json"), "utf-8"),
) as { version: string };

const nextConfig: NextConfig = {
  // #538: Partial Prerendering — every page gets a static shell served from
  // CDN with dynamic content streamed behind Suspense. Rollback = remove this
  // line (the removed force-dynamic directives are no-ops either way).
  cacheComponents: true,
  // #475: `next/root-params` lets i18n/request.ts read the [locale] segment
  // as a cache-key-safe route param instead of a request header — required
  // for next-intl to coexist with cacheComponents (PPR shells per locale).
  experimental: {
    rootParams: true,
  },
  env: {
    NEXT_PUBLIC_APP_VERSION: pkg.version,
    NEXT_PUBLIC_APP_SHA: (process.env.VERCEL_GIT_COMMIT_SHA ?? "").slice(0, 7),
  },
  // #1052: sponsorlogoer serveres fra Supabase Storage sin public-CDN-sti.
  // Wildcard-hostname dekker både prod- og staging-ref. Dagens visninger
  // bruker `unoptimized` (blobene er alt nedskalert klient-side, og Hobby-
  // tierens optimaliseringskvote spares), men mønsteret ligger klart den
  // dagen en flate vil optimalisere.
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
  // #1024: clickjacking-vern via CSP frame-ancestors. Bevisst KUN CSP (ikke
  // X-Frame-Options): XFO kan ikke overstyres per rute, og nettlesere med
  // CSP2-støtte lar frame-ancestors vinne over XFO uansett. Regel-rekkefølgen
  // gjør at embed-rutene (de eneste som SKAL kunne rammes inn på klubbsider)
  // overstyrer catch-all-en — siste matchende regel per header-nøkkel vinner.
  // NB: kun ikke-default locales har URL-prefiks (i18n/routing.ts) — et nytt
  // språk trenger en egen /<locale>/embed-regel her.
  async headers() {
    const frameAncestors = (value: string) => [
      { key: "Content-Security-Policy", value: `frame-ancestors ${value}` },
    ];
    return [
      { source: "/:path*", headers: frameAncestors("'none'") },
      { source: "/embed/:path*", headers: frameAncestors("*") },
      { source: "/en/embed/:path*", headers: frameAncestors("*") },
    ];
  },
  // #498: «Spillformer» ble omdøpt til «Spillformater» (riktig ord). Permanent
  // redirect så gamle bokmerker + allerede utsendte mail-lenker ikke brytes.
  async redirects() {
    return [
      {
        source: "/spillformer",
        destination: "/spillformater",
        permanent: true,
      },
      {
        source: "/spillformer/:slug",
        destination: "/spillformater/:slug",
        permanent: true,
      },
    ];
  },
};

// Aliases i18n/request.ts as the next-intl request config.
const withNextIntl = createNextIntlPlugin();

export default withNextIntl(nextConfig);
