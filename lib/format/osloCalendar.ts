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

/** A calendar date: year, month index 0–11 and day of month. */
export type CalendarDateParts = { year: number; month: number; day: number };

/**
 * Reads the calendar date of an instant. The default everywhere is
 * `osloParts`; the native app passes its own local-time reader (#2265),
 * because Hermes has no Europe/Oslo zone.
 */
export type DatePartsReader = (date: Date) => CalendarDateParts;

/**
 * ISO 8601 week number (1–53) of the Oslo-local date of `date`.
 *
 * The arithmetic runs on a UTC-constructed date built from the Oslo y/m/d, so
 * all reads go through `getUTC*` and stay TZ-stable — the same algorithm the
 * Klubbhuset page used inline, but anchored to the Oslo date instead of the
 * server-local one. `parts` swaps the calendar the date is read on (#2265);
 * the web never passes it.
 */
export function osloIsoWeek(date: Date, parts: DatePartsReader = osloParts): number {
  const { year, month, day } = parts(date);
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

/** «YYYY-MM-DD» from a calendar date's parts (month index 0–11). */
function dateKeyFromParts(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * The Oslo calendar date of `date` as «YYYY-MM-DD» (#2258). The terminliste
 * groups rounds into days with it: a 23:30 UTC tee-off in summer is 01:30 the
 * next day in Oslo and belongs under that day.
 */
export function osloDateKey(date: Date): string {
  const { year, month, day } = osloParts(date);
  return dateKeyFromParts(year, month, day);
}

/**
 * The Oslo date keys of «Denne helga» seen from `now` (#2258): Monday–Friday
 * give the coming Saturday and Sunday, Saturday gives today and tomorrow, and
 * Sunday only today. The day arithmetic runs on `Date.UTC` over the Oslo
 * date — a pure calendar ordinal, as in `teeOffProximity` — so neither the
 * host timezone nor a DST change can shift a day.
 */
export function osloWeekendDateKeys(now: Date): string[] {
  const { year, month, day, weekday } = osloParts(now); // weekday: Sun=0 … Sat=6
  const keyAt = (offset: number) => {
    const d = new Date(Date.UTC(year, month, day + offset));
    return dateKeyFromParts(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  };
  if (weekday === 0) return [keyAt(0)];
  const toSaturday = 6 - weekday;
  return [keyAt(toSaturday), keyAt(toSaturday + 1)];
}
