import type { MetadataRoute } from 'next';

/**
 * robots.txt (#1023): everything is crawlable — the auth-gate in proxy.ts
 * already keeps logged-in surfaces behind login, so a blanket allow exposes
 * exactly the public pages (login, legal, signup, spectate, baner). The
 * sitemap pointer is what actually feeds Google the course URLs.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/' },
    sitemap: 'https://tornygolf.no/sitemap.xml',
  };
}
