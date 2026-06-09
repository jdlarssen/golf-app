import type { NextConfig } from "next";
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

export default nextConfig;
