/**
 * Oslo-local calendar helpers (#646).
 *
 * The Klubbhuset greeting card computed its date, ISO week and time-of-day from
 * local-TZ `Date` getters. On the UTC Vercel server that meant UTC, not
 * Europe/Oslo — so just past midnight Norwegian time the card showed the
 * previous day and «God kveld» instead of the correct day and «God morgen».
 *
 * These helpers derive everything from `osloParts` (the shared Europe/Oslo
 * primitive in teeOff.ts), so they are TZ-stable regardless of the host TZ.
 */

import { osloParts } from './teeOff';

/**
 * ISO 8601 week number (1–53) of the Oslo-local date of `date`.
 *
 * The arithmetic runs on a UTC-constructed date built from the Oslo y/m/d, so
 * all reads go through `getUTC*` and stay TZ-stable — the same algorithm the
 * Klubbhuset page used inline, but anchored to the Oslo date instead of the
 * server-local one.
 */
export function osloIsoWeek(date: Date): number {
  const { year, month, day } = osloParts(date);
  const target = new Date(Date.UTC(year, month, day));
  const dayNr = (target.getUTCDay() + 6) % 7; // Mon=0 … Sun=6
  target.setUTCDate(target.getUTCDate() - dayNr + 3); // move to the week's Thursday
  const firstThursday = target.valueOf();
  target.setUTCMonth(0, 1); // 1 Jan of the Thursday's year
  if (target.getUTCDay() !== 4) {
    target.setUTCMonth(0, 1 + (((4 - target.getUTCDay()) + 7) % 7));
  }
  return 1 + Math.ceil((firstThursday - target.valueOf()) / 604800000);
}

/**
 * The Oslo-local calendar year of `date`, plus the half-open UTC instant window
 * `[startIso, endIso)` that spans that Oslo year — i.e. Oslo midnight 1 January
 * of the year up to (but not including) Oslo midnight 1 January of the next.
 *
 * Used to derive the admin «Sak {YYYY}-{NNN}» number (#651): both the year
 * label and the count window must follow Oslo wall-clock, not the UTC Vercel
 * server. A game created at 1 Jan 00:30 Oslo (= 31 Dec 23:30 UTC) belongs to
 * the new year and its sequence bucket — a naive `getFullYear()` /
 * `…T00:00:00Z` boundary placed it in the old year.
 *
 * 1 January is *always* CET (UTC+1) in Oslo — DST runs late March to late
 * October and never covers January — so the boundary offset is fixed and needs
 * no runtime probe; `new Date('YYYY-01-01T00:00:00+01:00')` is exact.
 */
export function osloYearWindow(date: Date): {
  year: number;
  startIso: string;
  endIso: string;
} {
  const { year } = osloParts(date);
  const osloNewYearUtc = (y: number) =>
    new Date(`${y}-01-01T00:00:00+01:00`).toISOString();
  return {
    year,
    startIso: osloNewYearUtc(year),
    endIso: osloNewYearUtc(year + 1),
  };
}

export type OsloTimeOfDay = 'morgen' | 'formiddag' | 'ettermiddag' | 'kveld';

/**
 * Time-of-day bucket from the Oslo-local hour, matching the greeting's existing
 * boundaries: morgen (<10), formiddag (<12), ettermiddag (<18), kveld (else).
 *
 * There is deliberately no «natt» bucket — pre-existing behaviour maps
 * 00:00–09:59 to «morgen», which is what #646 lists as acceptable.
 */
export function osloTimeOfDayBucket(date: Date): OsloTimeOfDay {
  const { hour } = osloParts(date);
  if (hour < 10) return 'morgen';
  if (hour < 12) return 'formiddag';
  if (hour < 18) return 'ettermiddag';
  return 'kveld';
}
