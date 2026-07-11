import { describe, it, expect } from 'vitest';
import { defaultTeeOffAt } from './defaultTeeOff';

/**
 * Type A / TDD — asserts the Oslo wall-clock `datetime-local` string.
 *
 * Inputs are given as absolute UTC instants (`...Z`); the helper is expected
 * to read them in Europe/Oslo. Offsets used: CEST (UTC+2) in July, CET (UTC+1)
 * in late March / December. 2026-07-11 is a Saturday — every fixture is
 * anchored off that so the weekday arithmetic is checkable by hand.
 */
describe('defaultTeeOffAt', () => {
  it.each([
    // class            | now (absolute UTC)        | expected Oslo wall-clock
    ['midweek (Wed)', '2026-07-08T13:00:00Z', '2026-07-11T09:00'],
    ['Saturday before 09:00', '2026-07-11T06:00:00Z', '2026-07-11T09:00'],
    ['Saturday exactly 09:00', '2026-07-11T07:00:00Z', '2026-07-18T09:00'],
    ['Saturday after 09:00', '2026-07-11T08:00:00Z', '2026-07-18T09:00'],
    ['Sunday', '2026-07-12T10:00:00Z', '2026-07-18T09:00'],
    ['crosses month boundary', '2026-07-30T10:00:00Z', '2026-08-01T09:00'],
    ['crosses year boundary', '2026-12-30T11:00:00Z', '2027-01-02T09:00'],
    ['DST-transition week (spring)', '2026-03-27T11:00:00Z', '2026-03-28T09:00'],
  ])('returns next Saturday 09:00 Oslo for %s', (_label, iso, expected) => {
    expect(defaultTeeOffAt(new Date(iso))).toBe(expected);
  });

  it('always returns a strictly-future instant (never triggers teeOffInPast)', () => {
    // Saturday 08:59 Oslo → today 09:00 is still ahead of now.
    const satBefore = defaultTeeOffAt(new Date('2026-07-11T06:59:00Z'));
    expect(satBefore).toBe('2026-07-11T09:00');
    // A weekday is always days ahead.
    const weekday = defaultTeeOffAt(new Date('2026-07-08T13:00:00Z'));
    expect(weekday > '2026-07-08').toBe(true);
  });
});
