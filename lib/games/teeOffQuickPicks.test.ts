import { describe, expect, it } from 'vitest';
import { QUICK_PICK_TIMES, teeOffNowLocal, teeOffQuickPicks } from './teeOffQuickPicks';
import { defaultTeeOffAt } from './defaultTeeOff';

describe('teeOffQuickPicks (#2448, #2463)', () => {
  it('today and tomorrow, and no Saturday (#2463)', () => {
    // Wed 4 Nov 2026
    expect(teeOffQuickPicks('2026-11-04T14:20').days).toEqual(['2026-11-04', '2026-11-05']);
    // Fri 6 Nov 2026
    expect(teeOffQuickPicks('2026-11-06T10:00').days).toEqual(['2026-11-06', '2026-11-07']);
  });

  it('runs over a month and a year', () => {
    // Thu 31 Dec 2026
    expect(teeOffQuickPicks('2026-12-31T12:00').days).toEqual(['2026-12-31', '2027-01-01']);
  });

  it('counts calendar days over the clock change (Sun 25 Oct 2026, Sun 28 Mar 2027)', () => {
    // Sat 24 Oct 2026, the night summer time ends
    expect(teeOffQuickPicks('2026-10-24T23:30').days).toEqual(['2026-10-24', '2026-10-25']);
    // Sat 27 Mar 2027, the night summer time starts
    expect(teeOffQuickPicks('2027-03-27T23:59').days).toEqual(['2027-03-27', '2027-03-28']);
  });

  it('offers 08:00, 09:00 and 10:00', () => {
    expect(teeOffQuickPicks('2026-11-04T14:20').times).toEqual(['08:00', '09:00', '10:00']);
    expect(QUICK_PICK_TIMES).toEqual(['08:00', '09:00', '10:00']);
  });

  it('a malformed «now» gives no days rather than a wrong calendar', () => {
    expect(teeOffQuickPicks('').days).toEqual([]);
    expect(teeOffQuickPicks('garbage').days).toEqual([]);
  });

  // #2438's default (Saturday 09:00) lands on «I morgen» on a Friday and on
  // «I dag» on a Saturday morning. Any other day it is a day outside the
  // picks, which TeeOffQuickPicks shows as «Annen dag» with the date (#2463).
  it.each([
    ['Wednesday', '2026-11-04T12:00:00Z', -1],
    ['Friday', '2026-11-06T12:00:00Z', 1],
    ['Saturday before 09:00', '2026-11-07T07:00:00Z', 0],
    ['Saturday after 09:00', '2026-11-07T09:30:00Z', -1],
    ['Sunday', '2026-11-08T12:00:00Z', -1],
  ])('the default tee-off on a %s', (_label, iso, index) => {
    const now = new Date(iso);
    const picks = teeOffQuickPicks(teeOffNowLocal(now));
    const [day, time] = defaultTeeOffAt(now).split('T');
    expect(picks.days.indexOf(day)).toBe(index);
    expect(picks.times).toContain(time);
  });
});

describe('teeOffNowLocal', () => {
  it('is the Oslo wall clock, not the server zone', () => {
    // 23:30Z on 30 Nov is 00:30 on 1 Dec in Oslo (UTC+1).
    expect(teeOffNowLocal(new Date('2026-11-30T23:30:00Z'))).toBe('2026-12-01T00:30');
    // Summer time: UTC+2.
    expect(teeOffNowLocal(new Date('2026-07-01T22:15:00Z'))).toBe('2026-07-02T00:15');
  });
});
