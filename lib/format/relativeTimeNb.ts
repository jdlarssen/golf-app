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
  const diff = Math.max(0, nowMs - new Date(iso).getTime());
  const rtf = new Intl.RelativeTimeFormat('nb-NO', { numeric: 'auto' });

  if (diff < MINUTE_MS) return rtf.format(-Math.round(diff / SECOND_MS), 'second');
  if (diff < HOUR_MS) return rtf.format(-Math.round(diff / MINUTE_MS), 'minute');
  if (diff < DAY_MS) return rtf.format(-Math.round(diff / HOUR_MS), 'hour');
  if (diff < WEEK_MS) return rtf.format(-Math.round(diff / DAY_MS), 'day');
  if (diff < MONTH_MS) return rtf.format(-Math.round(diff / WEEK_MS), 'week');
  return rtf.format(-Math.round(diff / MONTH_MS), 'month');
}
