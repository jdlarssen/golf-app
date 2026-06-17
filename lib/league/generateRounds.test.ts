import { describe, it, expect } from 'vitest';
import { generateRounds } from './generateRounds';

/** Render an ISO instant as Oslo wall-clock 'YYYY-MM-DD HH:mm' for assertions. */
function osloWall(iso: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Oslo',
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  const hour = get('hour') === '24' ? '00' : get('hour');
  return `${get('year')}-${get('month')}-${get('day')} ${hour}:${get('minute')}`;
}

describe('generateRounds', () => {
  // Windows anchor to Oslo wall-clock (#687). In summer (CEST = UTC+2) Oslo
  // midnight is 22:00Z the previous day; 23:59 Oslo close is 21:59Z. The
  // helper is minute-aligned, so closes land on :00.000 of the minute.
  it('monthly: one window per calendar month, clipped to the season span (Oslo-anchored)', () => {
    const rounds = generateRounds('2026-06-01', '2026-08-31', 'monthly');
    expect(rounds.map((r) => r.sequence)).toEqual([1, 2, 3]);
    expect(rounds[0].opens_at).toBe('2026-05-31T22:00:00.000Z');
    expect(rounds[0].closes_at).toBe('2026-06-30T21:59:00.000Z');
    expect(rounds[1].opens_at).toBe('2026-06-30T22:00:00.000Z');
    expect(rounds[2].opens_at).toBe('2026-07-31T22:00:00.000Z');
    expect(rounds[2].closes_at).toBe('2026-08-31T21:59:00.000Z');
  });

  it('monthly: a June window opens at Oslo midnight and closes at Oslo 23:59', () => {
    // Explicit #687 assertion: the visible Oslo wall-clock bounds must be
    // 1 June 00:00 → 30 June 23:59, not shifted by the UTC offset.
    const [june] = generateRounds('2026-06-01', '2026-06-30', 'monthly');
    expect(osloWall(june.opens_at)).toBe('2026-06-01 00:00');
    expect(osloWall(june.closes_at)).toBe('2026-06-30 23:59');
  });

  it('monthly: winter month anchors to CET (UTC+1)', () => {
    // January is CET (UTC+1): Oslo midnight = 23:00Z prev day, 23:59 = 22:59Z.
    const [jan] = generateRounds('2026-01-01', '2026-01-31', 'monthly');
    expect(jan.opens_at).toBe('2025-12-31T23:00:00.000Z');
    expect(jan.closes_at).toBe('2026-01-31T22:59:00.000Z');
    expect(osloWall(jan.opens_at)).toBe('2026-01-01 00:00');
    expect(osloWall(jan.closes_at)).toBe('2026-01-31 23:59');
  });

  it('monthly: first and last windows are clipped to a mid-month season (Oslo wall-clock)', () => {
    const rounds = generateRounds('2026-06-15', '2026-07-10', 'monthly');
    expect(rounds).toHaveLength(2);
    expect(osloWall(rounds[0].opens_at)).toBe('2026-06-15 00:00');
    expect(osloWall(rounds[0].closes_at)).toBe('2026-06-30 23:59');
    expect(osloWall(rounds[1].opens_at)).toBe('2026-07-01 00:00');
    expect(osloWall(rounds[1].closes_at)).toBe('2026-07-10 23:59');
  });

  it('weekly: 7-day windows from Oslo season start, last one clipped', () => {
    const rounds = generateRounds('2026-06-01', '2026-06-21', 'weekly');
    expect(rounds).toHaveLength(3);
    expect(rounds[0].opens_at).toBe('2026-05-31T22:00:00.000Z');
    expect(osloWall(rounds[0].opens_at)).toBe('2026-06-01 00:00');
    expect(osloWall(rounds[1].opens_at)).toBe('2026-06-08 00:00');
    expect(osloWall(rounds[2].opens_at)).toBe('2026-06-15 00:00');
    expect(osloWall(rounds[2].closes_at)).toBe('2026-06-21 23:59');
  });

  it('biweekly: 14-day windows from Oslo season start', () => {
    const rounds = generateRounds('2026-06-01', '2026-06-28', 'biweekly');
    expect(rounds).toHaveLength(2);
    expect(osloWall(rounds[0].opens_at)).toBe('2026-06-01 00:00');
    expect(osloWall(rounds[1].opens_at)).toBe('2026-06-15 00:00');
  });

  it('windows never overlap and stay in order', () => {
    for (const freq of ['weekly', 'biweekly', 'monthly'] as const) {
      const rounds = generateRounds('2026-06-01', '2026-12-31', freq);
      for (let i = 1; i < rounds.length; i++) {
        expect(new Date(rounds[i].opens_at).getTime()).toBeGreaterThan(
          new Date(rounds[i - 1].closes_at).getTime(),
        );
        expect(new Date(rounds[i].closes_at).getTime()).toBeGreaterThan(
          new Date(rounds[i].opens_at).getTime(),
        );
      }
    }
  });

  it('custom returns no windows (admin adds them manually)', () => {
    expect(generateRounds('2026-06-01', '2026-12-31', 'custom')).toEqual([]);
  });

  it('returns nothing when the season end is before the start', () => {
    expect(generateRounds('2026-08-01', '2026-06-01', 'monthly')).toEqual([]);
  });
});
