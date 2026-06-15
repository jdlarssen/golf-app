import type { AppLocale } from '@/i18n/routing';
import {
  formatTeeOffDate as formatTeeOffDateNb,
  formatTeeOffTime as formatTeeOffTimeNb,
} from '@/lib/format/teeOff';
import {
  formatShortDateNb as formatShortDateNbLegacy,
  formatShortDateNbWithYear as formatShortDateNbWithYearLegacy,
  formatMonthLongNb,
} from '@/lib/format/date';
import { formatCountdown as formatCountdownNb } from '@/lib/format/countdown';
import { formatRelativeNb as formatRelativeNbLegacy } from '@/lib/format/relativeTimeNb';

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
 * Locale-aware short date WITHOUT year.
 *
 * Norwegian ('no'): delegates to legacy helper → "14. mai" (byte-identical).
 * English ('en'):   "14 May" — day numeric, month short (en-GB, no year).
 *
 * Note: the legacy helper reads local (server/browser) TZ via Date#getDate etc.
 * This helper preserves that behaviour for 'no' and mirrors it for 'en'.
 */
export function formatShortDateLocale(
  input: Date | string,
  locale: AppLocale,
): string {
  if (locale === 'no') return formatShortDateNbLegacy(input);
  const d = input instanceof Date ? input : new Date(input);
  return d.toLocaleDateString(intlLocaleTag(locale), {
    day: 'numeric',
    month: 'short',
  });
}

// ---------------------------------------------------------------------------
// Constants shared between formatRelativeLocale and its tests.
// ---------------------------------------------------------------------------
const SECOND_MS = 1_000;
const MINUTE_MS = 60 * SECOND_MS;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const WEEK_MS = 7 * DAY_MS;
const MONTH_MS = 30 * DAY_MS;

/**
 * Locale-aware relative time string.
 *
 * Norwegian ('no'): delegates byte-identically to `formatRelativeNb` (same
 * Intl.RelativeTimeFormat thresholds and phrasing).
 * English ('en'):   mirrors the same 6-tier ladder with idiomatic English
 * using `Intl.RelativeTimeFormat('en-GB', { numeric: 'auto' })` — e.g.
 * "just now", "5 minutes ago", "yesterday", "2 weeks ago".
 *
 * Both paths floor negative diffs to 0 (server clock-skew safeguard).
 * `nowMs` defaults to `Date.now()` and is injectable for tests.
 */
export function formatRelativeLocale(
  iso: string,
  locale: AppLocale,
  nowMs: number = Date.now(),
): string {
  if (locale === 'no') return formatRelativeNbLegacy(iso, nowMs);

  const diff = Math.max(0, nowMs - new Date(iso).getTime());
  const rtf = new Intl.RelativeTimeFormat('en-GB', { numeric: 'auto' });

  if (diff < MINUTE_MS) return rtf.format(-Math.round(diff / SECOND_MS), 'second');
  if (diff < HOUR_MS) return rtf.format(-Math.round(diff / MINUTE_MS), 'minute');
  if (diff < DAY_MS) return rtf.format(-Math.round(diff / HOUR_MS), 'hour');
  if (diff < WEEK_MS) return rtf.format(-Math.round(diff / DAY_MS), 'day');
  if (diff < MONTH_MS) return rtf.format(-Math.round(diff / WEEK_MS), 'week');
  return rtf.format(-Math.round(diff / MONTH_MS), 'month');
}

// ---------------------------------------------------------------------------
// Short UTC day+month helper (#566 Fase 2d prerequisites).
//
// Used by LigaRoundRow.formatWindowDate («12. mai, 14:30» style) and by
// CreateLigaForm's MONTHS_ABBR round-preview sentence.
//
// IMPORTANT: Intl nb-NO with { day: 'numeric', month: 'short' } produces
// 'jan.' (trailing dot) for some months and 'mars'/'juni'/'juli' instead of
// 'mar'/'jun'/'jul'. Neither matches the legacy hand-rolled array, so the 'no'
// path replicates it explicitly — byte-identical output is a hard requirement
// (5 snapshot tests assert exact Norwegian strings, plus LigaRoundRow render).
// ---------------------------------------------------------------------------

const NO_MONTHS_SHORT = [
  'jan', 'feb', 'mar', 'apr', 'mai', 'jun',
  'jul', 'aug', 'sep', 'okt', 'nov', 'des',
] as const;

/**
 * Short month abbreviation for the given 0-based month index.
 *
 * Norwegian ('no'): uses the legacy hand-rolled array — byte-identical to
 * the in-file MONTHS_ABBR constant in CreateLigaForm and LigaRoundRow.
 * English ('en'):   3-letter capitalised abbreviation via en-GB Intl.
 */
export function shortMonthLocale(monthIndex: number, locale: AppLocale): string {
  if (locale === 'no') return NO_MONTHS_SHORT[monthIndex];
  // Probe a fixed day (15) to avoid month-boundary ambiguity.
  const probe = new Date(Date.UTC(2000, monthIndex, 15));
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'UTC',
    month: 'short',
  }).format(probe);
}

/**
 * Locale-aware long month + year, e.g. «juni 2026» / "June 2026". Used for the
 * spill-arkiv month-group headings (#571).
 *
 * Norwegian ('no'): delegates to `formatMonthLongNb` (byte-identical lowercase
 *   month + year, local date-getters).
 * English ('en'):   en-GB Intl `month: 'long'` + year, local TZ to match the
 *   local-getter month bucketing in `groupFinishedByMonth`.
 */
export function formatMonthLongLocale(
  iso: string | Date,
  locale: AppLocale,
): string {
  if (locale === 'no') return formatMonthLongNb(iso);
  const d = iso instanceof Date ? iso : new Date(iso);
  return new Intl.DateTimeFormat('en-GB', {
    month: 'long',
    year: 'numeric',
  }).format(d);
}

/**
 * Locale-aware short day + month string, UTC-based.
 *
 * Norwegian ('no'): «12. mai» — byte-identical to LigaRoundRow.formatWindowDate
 *   and CreateLigaForm month-preview sentence (uses legacy NO_MONTHS_SHORT).
 * English ('en'):   «12 May» — en-GB Intl, no trailing dot on day.
 *
 * Input: ISO timestamp string (e.g. '2026-05-12T14:30:00Z').
 * UTC date-getters are used so the output matches the stored UTC value
 * (same as LigaRoundRow's current getUTCDate / getUTCMonth calls).
 */
export function formatShortUTCDayMonthLocale(iso: string, locale: AppLocale): string {
  const d = new Date(iso);
  const day = d.getUTCDate();
  const monthIdx = d.getUTCMonth();

  if (locale === 'no') {
    return `${day}. ${NO_MONTHS_SHORT[monthIdx]}`;
  }

  // en-GB Intl with timeZone UTC for consistent output.
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'short',
  });
  const parts = fmt.formatToParts(d);
  const dayStr = parts.find((p) => p.type === 'day')?.value ?? String(day);
  const monthStr = parts.find((p) => p.type === 'month')?.value ?? '';
  return `${dayStr} ${monthStr}`;
}

/**
 * Oslo-based sibling of `formatShortUTCDayMonthLocale`: short day + month in
 * Europe/Oslo wall-clock, so it pairs with `formatTeeOffTimeLocale` for an
 * admin-facing window label that matches the time the admin actually picked.
 *
 * Norwegian ('no'): «12. mai» (legacy NO_MONTHS_SHORT, Oslo month index).
 * English ('en'):   «12 May» (en-GB Intl in Oslo).
 *
 * Input: ISO timestamp string or a Date. Unlike the UTC variant, the day/month
 * are read in Oslo time — a `23:32Z` instant in June is «15. jun» here (Oslo has
 * rolled past midnight) but «14. jun» under UTC. This is why admin surfaces that
 * must match the organiser's wall-clock (game-protocol date, Klubbhuset greeting,
 * dashboard «last signed/published») route their dates through here (#637/#646).
 */
export function formatShortOsloDayMonthLocale(
  input: string | Date,
  locale: AppLocale,
): string {
  const d = toDate(input);
  if (locale === 'no') {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: OSLO,
      day: 'numeric',
      month: 'numeric',
    }).formatToParts(d);
    const dayStr = parts.find((p) => p.type === 'day')?.value ?? '';
    const monthIdx = Number(parts.find((p) => p.type === 'month')?.value ?? '1') - 1;
    return `${dayStr}. ${NO_MONTHS_SHORT[monthIdx]}`;
  }
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: OSLO,
    day: 'numeric',
    month: 'short',
  }).formatToParts(d);
  const dayStr = parts.find((p) => p.type === 'day')?.value ?? '';
  const monthStr = parts.find((p) => p.type === 'month')?.value ?? '';
  return `${dayStr} ${monthStr}`;
}

/**
 * 24-hour «HH:MM» in Europe/Oslo wall-clock (#646). Locale-independent — the
 * 24-hour clock renders identically for 'no' and 'en' — but pinned to Oslo so
 * the Klubbhuset activity log shows the time the action actually happened in
 * Norway, not the UTC server time.
 */
export function formatHHMMOslo(input: DateInput): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: OSLO,
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(toDate(input));
  const hour = parts.find((p) => p.type === 'hour')?.value ?? '00';
  const minute = parts.find((p) => p.type === 'minute')?.value ?? '00';
  // Intl may render midnight as '24' on some engines — normalise.
  const h = hour === '24' ? '00' : hour;
  return `${h}:${minute}`;
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
