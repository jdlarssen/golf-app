// Shared helpers for parsing and validating the admin "create game" / "edit
// game" form payload. Used by both the new-game and edit-game server actions.

/**
 * Parse a 'YYYY-MM-DDTHH:mm' string (as emitted by <input type="datetime-local">)
 * as wall-clock time in Europe/Oslo and return the corresponding UTC ISO string.
 *
 * Strategy: ask Intl what the timezone-name short label is for the given Oslo
 * wall-clock date (CET = GMT+1, CEST = GMT+2). Append the matching offset
 * suffix and let `new Date()` parse the offset-bearing string into UTC.
 * This handles DST transitions correctly for any non-ambiguous wall-clock
 * instant. (Ambiguous instants — the autumn fall-back hour — are vanishingly
 * rare for golf tee-offs and fall back to the post-transition offset.)
 *
 * Throws RangeError on malformed input.
 */
export function parseOsloDateTimeLocal(s: string): string {
  const [datePart] = s.split('T');
  const [y, m, d] = datePart.split('-').map(Number);
  // Probe at noon UTC on the target date: avoids straddling the midnight
  // DST boundary and yields the right offset for the day.
  const probe = new Date(Date.UTC(y, m - 1, d, 12, 0));
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Oslo',
    timeZoneName: 'short',
  });
  const tzPart = fmt
    .formatToParts(probe)
    .find((p) => p.type === 'timeZoneName')?.value;
  const offset = tzPart === 'GMT+2' ? '+02:00' : '+01:00';
  const result = new Date(`${s}:00${offset}`);
  if (Number.isNaN(result.getTime())) {
    throw new RangeError(`Invalid Oslo datetime-local: ${s}`);
  }
  return result.toISOString();
}
