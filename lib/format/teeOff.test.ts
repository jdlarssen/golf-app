// Force the host timezone to UTC for these tests so they catch regressions
// on a UTC CI runner / Vercel server — and pass identically on an Oslo dev
// machine. The formatters under test must produce Oslo wall-clock output
// regardless of process.env.TZ.
process.env.TZ = 'UTC';

import { describe, it, expect } from 'vitest';
import { formatTeeOffDate, formatTeeOffTime, expectedFirstScoreTime, osloParts } from './teeOff';

// 2026-05-12T12:24:00Z === 2026-05-12 14:24 in Oslo (CEST, summer DST, +02:00)
const TEE_OFF = new Date('2026-05-12T14:24:00+02:00');

describe('formatTeeOffTime', () => {
  it('returns HH:MM in 24h Norwegian format', () => {
    expect(formatTeeOffTime(TEE_OFF)).toBe('14:24');
  });

  it('renders UTC noon as Oslo 14:00 in summer (CEST, +02:00)', () => {
    expect(formatTeeOffTime(new Date('2026-05-14T12:00:00Z'))).toBe('14:00');
  });

  it('renders UTC noon as Oslo 13:00 in winter (CET, +01:00)', () => {
    expect(formatTeeOffTime(new Date('2026-01-14T12:00:00Z'))).toBe('13:00');
  });
});

describe('formatTeeOffDate', () => {
  it('returns short Norwegian date with day-of-week, date and month', () => {
    // 2026-05-12 is a Tuesday → "tir. 12. mai"
    expect(formatTeeOffDate(TEE_OFF)).toBe('tir. 12. mai');
  });

  it('formats a Saturday correctly', () => {
    // 2026-05-16 is a Saturday → "lør. 16. mai"
    const sat = new Date('2026-05-16T10:00:00+02:00');
    expect(formatTeeOffDate(sat)).toBe('lør. 16. mai');
  });

  it('renders an Oslo-summer afternoon as "tor. 14. mai"', () => {
    // 2026-05-14 12:00 UTC === 2026-05-14 14:00 Oslo, a Thursday
    expect(formatTeeOffDate(new Date('2026-05-14T12:00:00Z'))).toBe('tor. 14. mai');
  });

  it('uses Oslo wall-clock date across the UTC midnight boundary', () => {
    // 2026-05-13 23:30 UTC === 2026-05-14 01:30 Oslo summer → "tor. 14. mai"
    expect(formatTeeOffDate(new Date('2026-05-13T23:30:00Z'))).toBe('tor. 14. mai');
    // 2026-01-13 23:30 UTC === 2026-01-14 00:30 Oslo winter → "ons. 14. jan"
    expect(formatTeeOffDate(new Date('2026-01-13T23:30:00Z'))).toBe('ons. 14. jan');
  });
});

describe('expectedFirstScoreTime', () => {
  it('rounds tee-off + 30 min up to nearest 5 minutes', () => {
    // 14:24 Oslo + 30 = 14:54 → rounded UP to 14:55
    expect(expectedFirstScoreTime(TEE_OFF)).toBe('14:55');
  });

  it('handles exact 5-minute boundaries cleanly', () => {
    const exact = new Date('2026-05-12T14:00:00+02:00');
    // 14:00 Oslo + 30 = 14:30 (already on boundary)
    expect(expectedFirstScoreTime(exact)).toBe('14:30');
  });

  it('rolls over the hour when rounding pushes past :60', () => {
    // 14:26 Oslo + 30 = 14:56 → rounded UP to 15:00
    const nearHourBoundary = new Date('2026-05-12T14:26:00+02:00');
    expect(expectedFirstScoreTime(nearHourBoundary)).toBe('15:00');
  });

  it('rolls into the next day when tee-off is near midnight', () => {
    // 23:55 Oslo + 30 = 00:25 next day → already on boundary
    const lateNight = new Date('2026-05-12T23:55:00+02:00');
    expect(expectedFirstScoreTime(lateNight)).toBe('00:25');
  });
});

describe('osloParts', () => {
  it('returns Oslo wall-clock parts including year', () => {
    // 2026-05-12 14:24 Oslo (CEST). Tuesday.
    expect(osloParts(TEE_OFF)).toEqual({
      year: 2026,
      month: 4, // 0-indexed May
      day: 12,
      hour: 14,
      minute: 24,
      weekday: 2, // Tuesday
    });
  });

  it('reads year/month/day in Oslo time across a UTC midnight boundary', () => {
    // 2026-06-14T23:32:00Z === 2026-06-15 01:32 Oslo (CEST). The UTC date is
    // still 14 Jun, but Oslo has rolled over to 15 Jun — the #646 case.
    const nearMidnight = new Date('2026-06-14T23:32:00Z');
    const parts = osloParts(nearMidnight);
    expect(parts.year).toBe(2026);
    expect(parts.month).toBe(5); // June
    expect(parts.day).toBe(15); // Oslo date, not UTC's 14
    expect(parts.hour).toBe(1); // Oslo 01:xx, not UTC 23
  });

  it('reads Oslo wall-clock across the New Year boundary', () => {
    // 2026-12-31T23:30:00Z === 2027-01-01 00:30 Oslo (CET, +01:00).
    const newYear = new Date('2026-12-31T23:30:00Z');
    const parts = osloParts(newYear);
    expect(parts.year).toBe(2027);
    expect(parts.month).toBe(0); // January
    expect(parts.day).toBe(1);
  });
});
