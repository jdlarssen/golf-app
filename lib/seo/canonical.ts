import { routing, type AppLocale } from '@/i18n/routing';

/**
 * Locale-aware canonical path for `alternates.canonical` (#1264). The default
 * locale keeps today's unprefixed URLs; other locales get their routing
 * prefix (`/en`). Combined with `metadataBase` on the root layout, callers can
 * pass the result straight into `alternates: { canonical }`.
 */
export function canonicalPath(locale: AppLocale, path: string): string {
  return locale === routing.defaultLocale ? path : `/${locale}${path}`;
}
