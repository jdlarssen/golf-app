import type { AppLocale } from '@/i18n/routing';
import {
  formatTeeOffDate as formatTeeOffDateNb,
  formatTeeOffTime as formatTeeOffTimeNb,
} from '@/lib/format/teeOff';
import { formatShortDateNbWithYear as formatShortDateNbWithYearLegacy } from '@/lib/format/date';
import { formatCountdown as formatCountdownNb } from '@/lib/format/countdown';

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

// ---------------------------------------------------------------------------
// Locale-aware tee-off / countdown helpers (#554 Fase 2a prerequisites).
//
// Norwegian ('no') path DELEGATES to the legacy hand-rolled helpers so output
// is byte-identical to what the existing tests assert. Non-Norwegian paths
// render via Intl with Europe/Oslo timezone so the wall-clock is always Oslo.
//
// Call-sites in the core game loop pass the active locale from useLocale() or
// getLocale() — these helpers are pure and Type A-testable.
// ---------------------------------------------------------------------------

const OSLO = 'Europe/Oslo';

/**
 * Locale-aware tee-off time string. Output: "14:24" for all locales
 * (24-hour HH:MM, Oslo wall-clock — same format regardless of locale).
 * Delegates to the legacy helper for 'no' to guarantee byte-identical output.
 */
export function formatTeeOffTimeLocale(date: Date, locale: AppLocale): string {
  if (locale === 'no') return formatTeeOffTimeNb(date);
  // All locales: 24-hour HH:MM in Oslo time.
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: OSLO,
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(date);
  const hour = parts.find((p) => p.type === 'hour')?.value ?? '00';
  const minute = parts.find((p) => p.type === 'minute')?.value ?? '00';
  // Intl may render midnight as '24' on some engines — normalise.
  const h = hour === '24' ? '00' : hour;
  return `${h}:${minute}`;
}

/**
 * Locale-aware tee-off date string.
 *
 * Norwegian ('no'): delegates to legacy helper → "tir. 12. mai" (byte-identical).
 * English ('en'):   "Tue 12 May" — weekday-abbrev (no dot), day, month-abbrev,
 *                   matching the structure of the Norwegian output.
 */
export function formatTeeOffDateLocale(date: Date, locale: AppLocale): string {
  if (locale === 'no') return formatTeeOffDateNb(date);
  // en-GB: weekday short ("Tue"), day numeric, month short ("May"), no year.
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: OSLO,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
  // formatToParts to control the output structure precisely.
  const parts = fmt.formatToParts(date);
  const weekday = parts.find((p) => p.type === 'weekday')?.value ?? '';
  const day = parts.find((p) => p.type === 'day')?.value ?? '';
  const month = parts.find((p) => p.type === 'month')?.value ?? '';
  return `${weekday} ${day} ${month}`;
}

/**
 * Locale-aware short date with year.
 *
 * Norwegian ('no'): delegates to legacy helper → "14. mai 2026" (byte-identical).
 * English ('en'):   "14 May 2026" — day numeric, month short, year numeric (en-GB).
 *
 * Note: the legacy helper reads local (server/browser) TZ via Date#getDate etc.
 * For values that must be TZ-stable (tee-off times), use formatTeeOffDateLocale.
 * This helper is used for admin/slett-page dates where local-TZ behaviour is
 * acceptable (matches the legacy helper's existing behaviour for 'no').
 */
export function formatShortDateWithYearLocale(
  input: Date | string,
  locale: AppLocale,
): string {
  if (locale === 'no') return formatShortDateNbWithYearLegacy(input);
  const d = input instanceof Date ? input : new Date(input);
  return d.toLocaleDateString(intlLocaleTag(locale), {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

// Norwegian month names for the 'no' path of formatTeeOffLineLocale.
const NORWEGIAN_MONTHS_TEE_OFF = [
  'januar',
  'februar',
  'mars',
  'april',
  'mai',
  'juni',
  'juli',
  'august',
  'september',
  'oktober',
  'november',
  'desember',
] as const;

/**
 * Locale-aware tee-off line string for the ReadyStep summary card.
 *
 * Input: a `datetime-local` string (`YYYY-MM-DDTHH:mm`, no timezone).
 * `new Date(value)` parses it as local time — all field reads use local-time
 * getters so both 'no' and 'en' paths are consistent.
 *
 * Returns `null` for empty/whitespace input.
 * Returns `value` unchanged for a non-empty but unparseable input (mirrors
 * the component's current `return value` fallback so the later chunk that
 * replaces the local helper can stay byte-identical).
 *
 * Norwegian ('no'): "${day}. ${month} ${year} kl. ${hh}:${mm}"
 *   — byte-identical to ReadyStep's current `formatTeeOff` output.
 *   Example: "15. mai 2026 kl. 09:05"
 *
 * English ('en'): "${day} ${Month} ${year}, ${hh}:${mm}"
 *   — en-GB style, capitalised month via Intl, 24-hour clock.
 *   Example: "15 May 2026, 09:05"
 */
export function formatTeeOffLineLocale(
  value: string,
  locale: AppLocale,
): string | null {
  if (!value || !value.trim()) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  const day = date.getDate();
  const year = date.getFullYear();
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');

  if (locale === 'no') {
    const month = NORWEGIAN_MONTHS_TEE_OFF[date.getMonth()];
    return `${day}. ${month} ${year} kl. ${hh}:${mm}`;
  }

  // Non-Norwegian: derive capitalised month name via Intl (local-time month).
  const probe = new Date(2000, date.getMonth(), 15);
  const month = new Intl.DateTimeFormat(intlLocaleTag(locale), {
    month: 'long',
  }).format(probe);
  const monthCap = month.charAt(0).toUpperCase() + month.slice(1);
  return `${day} ${monthCap} ${year}, ${hh}:${mm}`;
}

/**
 * Locale-aware countdown string.
 *
 * Norwegian ('no'): delegates to legacy helper (byte-identical output).
 * English ('en'):   analogous English phrasing:
 *   ≤0 ms     → "Starting soon"
 *   <60 s     → "Starting in {n}s"
 *   <60 min   → "Starting in {n} min"
 *   <24 h     → "Starting in {h}h {m} min"
 *   ≥24 h     → "Starting in {n} day" / "Starting in {n} days"
 */
export function formatCountdownLocale(
  msUntilTeeOff: number,
  locale: AppLocale,
): string {
  if (locale === 'no') return formatCountdownNb(msUntilTeeOff);

  // English path — same arithmetic as the Norwegian helper.
  if (msUntilTeeOff <= 0) return 'Starting soon';

  const totalSeconds = Math.floor(msUntilTeeOff / 1000);
  if (totalSeconds < 60) return `Starting in ${totalSeconds}s`;

  const totalMinutes = Math.floor(totalSeconds / 60);
  if (totalMinutes < 60) return `Starting in ${totalMinutes} min`;

  const totalHours = Math.floor(totalMinutes / 60);
  if (totalHours < 24) {
    const minutes = totalMinutes - totalHours * 60;
    return `Starting in ${totalHours}h ${minutes} min`;
  }

  const days = Math.floor(totalHours / 24);
  return `Starting in ${days} ${days === 1 ? 'day' : 'days'}`;
}
