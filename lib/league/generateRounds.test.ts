import { describe, it, expect } from 'vitest';
import { generateRounds } from './generateRounds';

describe('generateRounds', () => {
  it('monthly: one window per calendar month, clipped to the season span', () => {
    const rounds = generateRounds('2026-06-01', '2026-08-31', 'monthly');
    expect(rounds.map((r) => r.sequence)).toEqual([1, 2, 3]);
    expect(rounds[0].opens_at).toBe('2026-06-01T00:00:00.000Z');
    expect(rounds[0].closes_at).toBe('2026-06-30T23:59:59.999Z');
    expect(rounds[1].opens_at).toBe('2026-07-01T00:00:00.000Z');
    expect(rounds[2].opens_at).toBe('2026-08-01T00:00:00.000Z');
    expect(rounds[2].closes_at).toBe('2026-08-31T23:59:59.999Z');
  });

  it('monthly: first and last windows are clipped to a mid-month season', () => {
    const rounds = generateRounds('2026-06-15', '2026-07-10', 'monthly');
    expect(rounds).toHaveLength(2);
    expect(rounds[0].opens_at).toBe('2026-06-15T00:00:00.000Z');
    expect(rounds[0].closes_at).toBe('2026-06-30T23:59:59.999Z');
    expect(rounds[1].opens_at).toBe('2026-07-01T00:00:00.000Z');
    expect(rounds[1].closes_at).toBe('2026-07-10T23:59:59.999Z');
  });

  it('weekly: 7-day windows from season start, last one clipped', () => {
    const rounds = generateRounds('2026-06-01', '2026-06-21', 'weekly');
    expect(rounds).toHaveLength(3);
    expect(rounds[0].opens_at).toBe('2026-06-01T00:00:00.000Z');
    expect(rounds[1].opens_at).toBe('2026-06-08T00:00:00.000Z');
    expect(rounds[2].opens_at).toBe('2026-06-15T00:00:00.000Z');
    expect(rounds[2].closes_at).toBe('2026-06-21T23:59:59.999Z');
  });

  it('biweekly: 14-day windows', () => {
    const rounds = generateRounds('2026-06-01', '2026-06-28', 'biweekly');
    expect(rounds).toHaveLength(2);
    expect(rounds[0].opens_at).toBe('2026-06-01T00:00:00.000Z');
    expect(rounds[1].opens_at).toBe('2026-06-15T00:00:00.000Z');
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
