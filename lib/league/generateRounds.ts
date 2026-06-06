import type { RoundFrequency } from './types';

/** A generated play window for one round. Timestamps are ISO (UTC). */
export type GeneratedRoundWindow = {
  sequence: number;
  opens_at: string;
  closes_at: string;
};

/**
 * Deterministically split a season span into round windows by frequency.
 * Pure (no Date.now) — all timestamps derive from the input dates, computed in
 * UTC to avoid timezone drift. `custom` returns nothing (the admin adds rounds
 * by hand). The caller sets `original_closes_at = closes_at` at insert time.
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

  const start = new Date(`${seasonStart}T00:00:00.000Z`);
  const endOfSeason = new Date(`${seasonEnd}T23:59:59.999Z`);
  if (endOfSeason.getTime() < start.getTime()) return [];

  const windows: GeneratedRoundWindow[] = [];
  const clip = (d: Date) => (d.getTime() < endOfSeason.getTime() ? d : endOfSeason);

  if (frequency === 'monthly') {
    let cursor = start;
    let sequence = 1;
    while (cursor.getTime() <= endOfSeason.getTime()) {
      const y = cursor.getUTCFullYear();
      const m = cursor.getUTCMonth();
      const lastOfMonth = new Date(Date.UTC(y, m + 1, 0, 23, 59, 59, 999));
      windows.push({
        sequence: sequence++,
        opens_at: cursor.toISOString(),
        closes_at: clip(lastOfMonth).toISOString(),
      });
      cursor = new Date(Date.UTC(y, m + 1, 1));
    }
    return windows;
  }

  const stepMs = (frequency === 'weekly' ? 7 : 14) * 24 * 60 * 60 * 1000;
  let opens = start;
  let sequence = 1;
  while (opens.getTime() <= endOfSeason.getTime()) {
    const next = new Date(opens.getTime() + stepMs);
    const periodEnd = new Date(next.getTime() - 1);
    windows.push({
      sequence: sequence++,
      opens_at: opens.toISOString(),
      closes_at: clip(periodEnd).toISOString(),
    });
    opens = next;
  }
  return windows;
}
