import { osloParts } from '@/lib/format/teeOff';

/**
 * Smart default for the "opprett spill"-wizard's tee-off field (#1171).
 *
 * Returns the first upcoming **Saturday 09:00 Europe/Oslo** as a timezone-naive
 * `datetime-local` string `YYYY-MM-DDTHH:mm` — the format the
 * `scheduled_tee_off_at` field (and `<input type="datetime-local">`) expects.
 * If it is already Saturday but before 09:00 → today 09:00; otherwise the next
 * Saturday. The result is always strictly in the future, so it never trips the
 * `teeOffInPast` nudge (#928) that would block publishing.
 *
 * MUST be computed on the server and threaded in as an `initialValues` prop —
 * never derived in render/effect. A render-side `new Date()` would produce a
 * hydration mismatch, and a mount effect would trip the repo's
 * `react-hooks/set-state-in-effect` lint rule (see #928/#1171). Keeping it a
 * pure `(now) => string` helper is what makes the SSR and client render read
 * the same deterministic string. Do not "simplify" this to a client-side
 * computation.
 */
export function defaultTeeOffAt(now: Date): string {
  const { year, month, day, weekday, hour } = osloParts(now);

  // Saturday = weekday 6. Before 09:00 → today; otherwise jump a full week.
  // Every other weekday: how many days until this week's Saturday
  // (Sun 0 → 6, Mon 1 → 5, … Fri 5 → 1).
  const daysToAdd = weekday === 6 ? (hour < 9 ? 0 : 7) : 6 - weekday;

  // Pure calendar arithmetic via the UTC epoch: DST-immune because we never
  // build an Oslo instant at 09:00 — we only add days to the Oslo wall-clock
  // date and format the resulting Y-M-D with a fixed "T09:00".
  const target = new Date(Date.UTC(year, month, day + daysToAdd));
  const yyyy = target.getUTCFullYear();
  const mm = String(target.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(target.getUTCDate()).padStart(2, '0');

  return `${yyyy}-${mm}-${dd}T09:00`;
}
