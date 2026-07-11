import { describe, it, expect } from 'vitest';
import { defaultSeasonDates } from './defaultSeason';

// #1178 — Type A / TDD for the season-date default rule. All inputs are `Date`
// instants; `defaultSeasonDates` reads them in Europe/Oslo (via osloParts), so
// these assertions are TZ-stable regardless of the host machine's timezone.
//
// Rule: start = today (Oslo). end = 30 Sept of the current year when the Oslo
// month is before September (month < 8, 0-idx); otherwise today + 3 months,
// with the day clamped to the target month's length.
describe('defaultSeasonDates', () => {
  it.each([
    // In-season (Jan–Aug) → end = 30 Sept same year.
    { label: 'mid-season May', now: '2026-05-14T09:00:00Z', start: '2026-05-14', end: '2026-09-30' },
    { label: 'January start', now: '2026-01-02T09:00:00Z', start: '2026-01-02', end: '2026-09-30' },
    // Boundary: August is still before September (month 7 < 8).
    { label: 'late August', now: '2026-08-31T09:00:00Z', start: '2026-08-31', end: '2026-09-30' },
    // Boundary: September (month 8) crosses to the +3-months branch.
    { label: 'early September', now: '2026-09-01T09:00:00Z', start: '2026-09-01', end: '2026-12-01' },
    // Out-of-season (Sept–Dec) → today + 3 months, with year rollover.
    { label: 'October → next Jan', now: '2026-10-15T09:00:00Z', start: '2026-10-15', end: '2027-01-15' },
    { label: 'December → next March', now: '2026-12-15T09:00:00Z', start: '2026-12-15', end: '2027-03-15' },
    // Day clamp: Nov 30 + 3 months = Feb 30 → clamped to Feb 28 (2027 not leap).
    { label: 'Nov 30 clamps to Feb 28', now: '2026-11-30T09:00:00Z', start: '2026-11-30', end: '2027-02-28' },
    // Day clamp into a leap February keeps the 29th.
    { label: 'Nov 29 clamps to Feb 29 (leap)', now: '2027-11-29T09:00:00Z', start: '2027-11-29', end: '2028-02-29' },
  ])('$label', ({ now, start, end }) => {
    expect(defaultSeasonDates(new Date(now))).toEqual({ start, end });
  });

  it('reads the instant in Oslo time, not UTC (year rollover across midnight)', () => {
    // 2026-12-31 23:30 UTC = 2027-01-01 00:30 in Oslo (winter, UTC+1).
    // Oslo day is 1 Jan 2027 → in-season branch → end 30 Sept 2027.
    expect(defaultSeasonDates(new Date('2026-12-31T23:30:00Z'))).toEqual({
      start: '2027-01-01',
      end: '2027-09-30',
    });
  });

  it('always yields end >= start (never trips the season_end < season_start guard)', () => {
    // Sample one instant per month across a year; the guard must never fire.
    for (let month = 0; month < 12; month++) {
      const mm = String(month + 1).padStart(2, '0');
      const { start, end } = defaultSeasonDates(new Date(`2026-${mm}-15T09:00:00Z`));
      expect(end >= start).toBe(true);
    }
  });
});
