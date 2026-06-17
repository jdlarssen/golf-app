import type { RoundFrequency } from './types';
import { parseOsloDateTimeLocal } from '@/lib/games/gamePayload';

/** A generated play window for one round. Timestamps are ISO (UTC). */
export type GeneratedRoundWindow = {
  sequence: number;
  opens_at: string;
  closes_at: string;
};

/** Zero-pad a number to two digits for a `YYYY-MM-DD` part. */
function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * UTC instant (ms) for the given Oslo wall-clock calendar date at HH:mm.
 * Routes through `parseOsloDateTimeLocal` so the boundary lands on the same
 * UTC instant convention the admin round-edit paths use (#648/#687) and
 * handles the CET/CEST offset per date.
 */
function osloInstant(y: number, m: number, d: number, time: string): number {
  return new Date(
    parseOsloDateTimeLocal(`${y}-${pad(m)}-${pad(d)}T${time}`),
  ).getTime();
}

/** Last day-of-month (1-12 month) for an Oslo-anchored monthly window. */
function lastDayOfMonth(y: number, m: number): number {
  // Day 0 of next month = last day of this month. Pure integer math, no TZ.
  return new Date(Date.UTC(m === 12 ? y + 1 : y, m === 12 ? 0 : m, 0)).getUTCDate();
}

/**
 * Deterministically split a season span into round windows by frequency.
 * Pure (no Date.now) — all timestamps derive from the input dates. Boundaries
 * are anchored to Europe/Oslo wall-clock (#687): a window opens at Oslo
 * midnight and closes at Oslo 23:59, so the stored UTC instants match what a
 * Norwegian owner picks and what the admin-edited rounds store via
 * parseOsloDateTimeLocal (#648). `custom` returns nothing (the admin adds
 * rounds by hand). The caller sets `original_closes_at = closes_at` at insert.
 *
 * - monthly: one window per overlapping calendar month, clipped to the span.
 * - weekly / biweekly: fixed 7- / 14-day windows from the season start, last
 *   window clipped to the season end.
 */
export function generateRounds(
  seasonStart: string,
  seasonEnd: string,
  frequency: RoundFrequency,
): GeneratedRoundWindow[] {
  if (frequency === 'custom') return [];

  const [sy, sm, sd] = seasonStart.split('-').map(Number);
  const [ey, em, ed] = seasonEnd.split('-').map(Number);
  if ([sy, sm, sd, ey, em, ed].some((n) => Number.isNaN(n))) return [];

  // Oslo wall-clock span bounds: season opens at 00:00 Oslo, closes 23:59 Oslo.
  const startMs = osloInstant(sy, sm, sd, '00:00');
  const endOfSeasonMs = osloInstant(ey, em, ed, '23:59');
  if (endOfSeasonMs < startMs) return [];
  const endIso = new Date(endOfSeasonMs).toISOString();

  const windows: GeneratedRoundWindow[] = [];
  const clip = (ms: number) => (ms < endOfSeasonMs ? new Date(ms).toISOString() : endIso);

  if (frequency === 'monthly') {
    let y = sy;
    let m = sm; // 1-based month
    let opensMs = startMs; // first window opens on the season-start day
    let sequence = 1;
    while (opensMs <= endOfSeasonMs) {
      const closeMs = osloInstant(y, m, lastDayOfMonth(y, m), '23:59');
      windows.push({
        sequence: sequence++,
        opens_at: new Date(opensMs).toISOString(),
        closes_at: clip(closeMs),
      });
      // Step to the 1st of the next Oslo month.
      if (m === 12) {
        y += 1;
        m = 1;
      } else {
        m += 1;
      }
      opensMs = osloInstant(y, m, 1, '00:00');
    }
    return windows;
  }

  // weekly / biweekly: re-anchor each window to Oslo midnight by stepping the
  // calendar date, so 7-/14-day windows stay at 00:00 Oslo across DST.
  const stepDays = frequency === 'weekly' ? 7 : 14;
  let y = sy;
  let m = sm;
  let d = sd;
  let sequence = 1;
  let opensMs = startMs;
  while (opensMs <= endOfSeasonMs) {
    // Next window's Oslo calendar date = current date + stepDays.
    const nextCal = new Date(Date.UTC(y, m - 1, d + stepDays));
    const ny = nextCal.getUTCFullYear();
    const nm = nextCal.getUTCMonth() + 1;
    const nd = nextCal.getUTCDate();
    const nextOpensMs = osloInstant(ny, nm, nd, '00:00');
    const periodEndMs = nextOpensMs - 60_000; // one minute before next opens
    windows.push({
      sequence: sequence++,
      opens_at: new Date(opensMs).toISOString(),
      closes_at: clip(periodEndMs),
    });
    y = ny;
    m = nm;
    d = nd;
    opensMs = nextOpensMs;
  }
  return windows;
}
