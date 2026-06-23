import { osloParts } from './teeOff';

/**
 * Locale-agnostic proximity classifier for an upcoming tee-off (#880).
 *
 * Only "soon" games (today .. {@link MAX_SOON_DAYS} ahead) get a bucket; a
 * past day, a far-out game, or a missing tee-off → `null` (the card then shows
 * the plain date). The bucket is rendered into «I dag kl. …» / «I morgen» /
 * «Om N dager» via the `home.proximity.*` ICU strings at the call-site.
 */
export type TeeOffProximity =
  | { kind: 'today' }
  | { kind: 'tomorrow' }
  | { kind: 'days'; days: number }
  | null;

const MAX_SOON_DAYS = 6;

/**
 * Whole-day count from a wall-clock (year, 0-indexed month, day). TZ-free —
 * we only diff two such counts, so no DST/offset enters. `Date.UTC` here is a
 * pure calendar→ordinal map, NOT a timezone conversion.
 */
function calendarDayNumber(year: number, month0: number, day: number): number {
  return Math.floor(Date.UTC(year, month0, day) / 86_400_000);
}

/**
 * Oslo calendar-day proximity of `teeOffISO` relative to `now`.
 *
 * Computed from Oslo wall-clock dates (`osloParts`), NOT `(teeOff - now)/DAY`,
 * so it never mis-buckets across midnight or a DST boundary: a tee-off 30
 * minutes after midnight is «I morgen», not «I dag», because it's the next
 * calendar day.
 */
export function teeOffProximity(
  teeOffISO: string | null,
  now: Date,
): TeeOffProximity {
  if (!teeOffISO) return null;
  const teeOff = new Date(teeOffISO);
  if (Number.isNaN(teeOff.getTime())) return null;

  const t = osloParts(teeOff);
  const n = osloParts(now);
  const diff =
    calendarDayNumber(t.year, t.month, t.day) -
    calendarDayNumber(n.year, n.month, n.day);

  if (diff < 0) return null; // tee-off day already passed
  if (diff === 0) return { kind: 'today' };
  if (diff === 1) return { kind: 'tomorrow' };
  if (diff <= MAX_SOON_DAYS) return { kind: 'days', days: diff };
  return null; // far out → plain date, no «snart»-label
}
