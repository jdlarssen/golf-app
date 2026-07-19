import { routing, type AppLocale } from '@/i18n/routing';

/**
 * Locale-aware canonical path for a public page (#1264).
 *
 * The default locale ('no') keeps today's unprefixed URLs; non-default locales
 * get their prefix (/en/...), matching next-intl's `as-needed` routing. The
 * result is a RELATIVE path — Next composes it against `metadataBase` (the apex
 * host, set in the root layout), so every canonical resolves to
 * `https://tornygolf.no/...` regardless of which host the request came in on.
 *
 * @param locale active locale (already narrowed to AppLocale by the caller)
 * @param path   app path with a leading slash, or '' / '/' for the front page
 */
export function canonicalPath(locale: AppLocale, path: string): string {
  const normalized = path === '' ? '/' : path;
  if (locale === routing.defaultLocale) return normalized;
  return normalized === '/' ? `/${locale}` : `/${locale}${normalized}`;
}
