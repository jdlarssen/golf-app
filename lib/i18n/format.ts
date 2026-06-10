import type { AppLocale } from '@/i18n/routing';

/**
 * Locale-aware date/number formatting (#475).
 *
 * App locales are short codes ('no', 'en'); Intl wants BCP 47 tags. Only
 * deviations live in the override map — any locale added to routing.ts later
 * (gd, ga, sv, …) IS its own valid Intl tag and needs no entry here (the
 * N-locale criterion: adding a locale must not require touching this file).
 *
 * Callers get the active locale from `getLocale()` (server) or `useLocale()`
 * (client) and pass it explicitly — keeps these helpers pure and Type A-testable.
 *
 * The hand-rolled Norwegian helpers in `lib/format/` (date.ts, teeOff.ts,
 * relativeTimeNb.ts) intentionally do NOT route through here yet: their
 * output deliberately differs from raw Intl (trailing-dot fixes etc.) and
 * their call-sites get localized in later phases.
 */
const INTL_TAG_OVERRIDES: Partial<Record<AppLocale, string>> = {
  no: 'nb-NO',
  en: 'en-GB', // European date order — "8 May 2026", not "May 8, 2026"
};

export function intlLocaleTag(locale: AppLocale): string {
  return INTL_TAG_OVERRIDES[locale] ?? locale;
}

type DateInput = Date | string | number;

function toDate(input: DateInput): Date {
  return input instanceof Date ? input : new Date(input);
}

export function formatDate(
  input: DateInput,
  locale: AppLocale,
  options: Intl.DateTimeFormatOptions,
): string {
  return toDate(input).toLocaleDateString(intlLocaleTag(locale), options);
}

export function formatTime(
  input: DateInput,
  locale: AppLocale,
  options: Intl.DateTimeFormatOptions,
): string {
  return toDate(input).toLocaleTimeString(intlLocaleTag(locale), options);
}

export function formatDateTime(
  input: DateInput,
  locale: AppLocale,
  options: Intl.DateTimeFormatOptions,
): string {
  return toDate(input).toLocaleString(intlLocaleTag(locale), options);
}

export function formatNumber(
  value: number,
  locale: AppLocale,
  options?: Intl.NumberFormatOptions,
): string {
  return value.toLocaleString(intlLocaleTag(locale), options);
}
