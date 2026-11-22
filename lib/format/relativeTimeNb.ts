import { osloDayNumber } from './osloCalendar';

const SECOND_MS = 1000;
const MINUTE_MS = 60 * SECOND_MS;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const WEEK_MS = 7 * DAY_MS;
const MONTH_MS = 30 * DAY_MS;

/**
 * Norsk relativ-tid-formattering via `Intl.RelativeTimeFormat('nb-NO')`.
 * Eksempler: «for 1 minutt siden», «for 3 timer siden», «i går», «for 2 uker
 * siden». Bruker `numeric: 'auto'` så «i går»/«i morgen» får natural-language-
 * varianten i stedet for «for 1 dag siden».
 *
 * Akseptérer enten ISO-streng eller eksplisitt `nowMs`-parameter for
 * testbarhet — defaulter til `Date.now()` i prod-bruk.
 *
 * Negativ diff (server-timestamp i fremtiden grunnet clock-skew) floor-es
 * til 0 så vi alltid sier «nå» eller «for X siden» — aldri «om 3 sekunder».
 */
export function formatRelativeNb(iso: string, nowMs: number = Date.now()): string {
  const thenMs = new Date(iso).getTime();
  // An unparseable stamp used to reach `rtf.format(NaN)` and throw a RangeError.
  if (!Number.isFinite(thenMs)) return '';
  const diff = Math.max(0, nowMs - thenMs);
  const rtf = new Intl.RelativeTimeFormat('nb-NO', { numeric: 'auto' });

  // The unit is picked AFTER rounding, so 59.5 min reads «for 1 time siden»
  // and never «for 60 minutter siden».
  const seconds = Math.round(diff / SECOND_MS);
  if (seconds < 60) return rtf.format(-seconds, 'second');
  const minutes = Math.round(diff / MINUTE_MS);
  if (minutes < 60) return rtf.format(-minutes, 'minute');
  const hours = Math.round(diff / HOUR_MS);
  if (hours < 24) return rtf.format(-hours, 'hour');
  // Whole days count Oslo calendar dates, not 24-hour blocks: Monday 23:30 to
  // Wednesday 00:30 is two days ago, not «i går» (#2288 made osloDayNumber).
  const days = Math.max(1, osloDayNumber(nowMs) - osloDayNumber(thenMs));
  if (days < 7) return rtf.format(-days, 'day');
  if (diff < MONTH_MS) return rtf.format(-Math.round(diff / WEEK_MS), 'week');
  return rtf.format(-Math.round(diff / MONTH_MS), 'month');
}
