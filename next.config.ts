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
