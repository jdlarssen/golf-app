// Import-free on purpose: the desk's elapsed-time pill is a client component,
// and importing it from `organizerDesk.ts` would pull the finish gate and
// `lib/scoring` into the page's client bundle (#2268). `organizerDesk.ts`
// re-exports it, so the rule keeps one home.

/**
 * Time since the round started, in whole minutes split into hours and
 * minutes. Null when it has not started (or the stamp does not parse); never
 * negative, so a clock that runs a little behind the server shows 0 min.
 */
export function elapsedParts(
  startedAt: string | null,
  now: Date,
): { hours: number; minutes: number } | null {
  if (startedAt == null) return null;
  const start = Date.parse(startedAt);
  if (Number.isNaN(start)) return null;
  const totalMinutes = Math.floor(Math.max(0, now.getTime() - start) / 60_000);
  return { hours: Math.floor(totalMinutes / 60), minutes: totalMinutes % 60 };
}
