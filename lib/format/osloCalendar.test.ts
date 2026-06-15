// Force the host timezone to UTC so these tests catch the Vercel-server
// regression (#646): the Klubbhuset greeting computed week / date / time-of-day
// from local-TZ getters, which on a UTC server is UTC, not Europe/Oslo.
process.env.TZ = 'UTC';

import { describe, it, expect } from 'vitest';
import { osloIsoWeek, osloTimeOfDayBucket } from './osloCalendar';

describe('osloIsoWeek', () => {
  it('returns the ISO week of the Oslo-local date for a mid-day instant', () => {
    // 2026-06-15 (Monday) is ISO week 25.
    expect(osloIsoWeek(new Date('2026-06-15T10:00:00Z'))).toBe(25);
  });

  it('uses the Oslo date, not UTC, in the ~22:00–24:00 window (#646 regression)', () => {
    // 2026-06-14T23:32:00Z === 01:32 Oslo on Monday 15 Jun (CEST). The UTC date
    // is still Sunday 14 Jun (week 24); the Oslo date is Monday 15 Jun (week 25).
    // A naive local-TZ isoWeek on a UTC server would return 24.
    expect(osloIsoWeek(new Date('2026-06-14T23:32:00Z'))).toBe(25);
  });

  it('computes the week from the Oslo date across the New Year boundary', () => {
    // 2026-12-31T23:30:00Z === 2027-01-01 00:30 Oslo (CET). ISO week 53 of 2026
    // runs into 2027; 1 Jan 2027 (Friday) belongs to week 53.
    expect(osloIsoWeek(new Date('2026-12-31T23:30:00Z'))).toBe(53);
  });
});

describe('osloTimeOfDayBucket', () => {
  it('buckets a just-past-midnight Oslo instant as morgen (#646 regression)', () => {
    // 23:32 UTC = 01:32 Oslo → morgen. The local-TZ (UTC) reading would be
    // hour 23 → kveld, i.e. the wrong «God kveld» the issue reported.
    expect(osloTimeOfDayBucket(new Date('2026-06-14T23:32:00Z'))).toBe('morgen');
  });

  it.each([
    // [UTC instant (summer, CEST +02:00), Oslo wall-clock hour, expected bucket]
    ['2026-06-15T05:59:00Z', '07:59', 'morgen'],
    ['2026-06-15T07:00:00Z', '09:00', 'morgen'], // boundary: 09 < 10
    ['2026-06-15T08:00:00Z', '10:00', 'formiddag'], // boundary: 10
    ['2026-06-15T09:59:00Z', '11:59', 'formiddag'],
    ['2026-06-15T10:00:00Z', '12:00', 'ettermiddag'], // boundary: 12
    ['2026-06-15T15:59:00Z', '17:59', 'ettermiddag'],
    ['2026-06-15T16:00:00Z', '18:00', 'kveld'], // boundary: 18
    ['2026-06-15T21:00:00Z', '23:00', 'kveld'],
  ] as const)('%s (Oslo %s) -> %s', (iso, _osloHour, expected) => {
    expect(osloTimeOfDayBucket(new Date(iso))).toBe(expected);
  });
});
