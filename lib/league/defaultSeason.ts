import { osloParts } from '@/lib/format/teeOff';

/**
 * Smart default for a league's season window (#1178).
 *
 * `CreateLigaForm` used to open with blank season dates. This gives the admin a
 * sensible, editable starting point tuned to the Norwegian golf season.
 *
 * Rule:
 * - `start` = today (Europe/Oslo).
 * - `end`   = 30 September of the current year when the Oslo month is before
 *   September (month < 8, 0-indexed); otherwise today + 3 months, with the day
 *   clamped to the target month's length (so 30 Nov + 3 mo → 28/29 Feb, not a
 *   surprise roll into March).
 *
 * Both branches guarantee `end >= start`, so the default submit never trips the
 * `season_end < season_start` guard.
 *
 * TZ-safety (#928/#687): the instant is read in Oslo wall-clock via `osloParts`,
 * and the caller computes the default on the SERVER, passing the strings as
 * props — so SSR and client hydrate the same `value` and there is no mismatch.
 */
export function defaultSeasonDates(now: Date): { start: string; end: string } {
  const { year, month, day } = osloParts(now);
  const start = isoDate(year, month, day);

  if (month < 8) {
    // Jan–Aug: the Norwegian season runs to ~30 Sept.
    return { start, end: isoDate(year, 8, 30) };
  }

  // Sept–Dec: no fixed season end makes sense, so offer today + 3 months.
  const targetMonthAbs = month + 3;
  const endYear = year + Math.floor(targetMonthAbs / 12);
  const endMonth = targetMonthAbs % 12;
  const endDay = Math.min(day, daysInMonth(endYear, endMonth));
  return { start, end: isoDate(endYear, endMonth, endDay) };
}

/** Formats a (year, 0-indexed month, day) triple as an ISO `YYYY-MM-DD` string. */
function isoDate(year: number, month: number, day: number): string {
  const mm = String(month + 1).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${year}-${mm}-${dd}`;
}

/** Days in a given (year, 0-indexed month), computed TZ-independently via UTC. */
function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}
