import { routing, type AppLocale } from '@/i18n/routing';

/**
 * Locale-aware canonical path for `alternates.canonical` (#1264). The default
 * locale keeps today's unprefixed URLs; other locales get their routing
 * prefix (`/en`). Combined with `metadataBase` on the root layout, callers can
 * pass the result straight into `alternates: { canonical }`.
 */
export function canonicalPath(locale: AppLocale, path: string): string {
  // Root special case (#1265): the bare front page must canonicalize WITHOUT a
  // trailing slash — default locale → '/', other locales → '/en' (not '/en/').
  // Matches app/sitemap.ts, which lists the root as `/en`, not `/en/`; the
  // naive `/${locale}${path}` form would emit '/en/' and split the signal.
  if (path === '/') {
    return locale === routing.defaultLocale ? '/' : `/${locale}`;
  }
  return locale === routing.defaultLocale ? path : `/${locale}${path}`;
}
