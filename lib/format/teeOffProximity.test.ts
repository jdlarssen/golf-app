import { describe, it, expect } from 'vitest';
import { teeOffProximity } from './teeOffProximity';

// All instants chosen in June (Oslo = UTC+2, summer time) unless noted.
// Oslo wall-clock = UTC + 2h here.
const now = new Date('2026-06-23T10:00:00Z'); // Oslo 12:00, Tue 2026-06-23

describe('teeOffProximity', () => {
  it('returns null for no tee-off', () => {
    expect(teeOffProximity(null, now)).toBeNull();
  });

  it('returns null for an unparseable date', () => {
    expect(teeOffProximity('not-a-date', now)).toBeNull();
  });

  it('buckets same Oslo calendar day as today', () => {
    // Oslo 09:00 same day (earlier than now, still "today")
    expect(teeOffProximity('2026-06-23T07:00:00Z', now)).toEqual({ kind: 'today' });
    // Oslo 20:00 same day (later today)
    expect(teeOffProximity('2026-06-23T18:00:00Z', now)).toEqual({ kind: 'today' });
  });

  it('buckets the next Oslo calendar day as tomorrow', () => {
    expect(teeOffProximity('2026-06-24T07:00:00Z', now)).toEqual({ kind: 'tomorrow' });
  });

  it('uses calendar days, not 24h windows (just-after-midnight = tomorrow)', () => {
    // now Oslo 23:30 Tue; tee-off Oslo 00:30 Wed → only 1h away but NEXT calendar day
    const lateNow = new Date('2026-06-23T21:30:00Z'); // Oslo 23:30 Tue
    expect(teeOffProximity('2026-06-23T22:30:00Z', lateNow)).toEqual({ kind: 'tomorrow' });
  });

  it('buckets 2–6 days ahead as days', () => {
    expect(teeOffProximity('2026-06-25T07:00:00Z', now)).toEqual({ kind: 'days', days: 2 });
    expect(teeOffProximity('2026-06-29T07:00:00Z', now)).toEqual({ kind: 'days', days: 6 });
  });

  it('returns null for games more than 6 days out', () => {
    expect(teeOffProximity('2026-06-30T07:00:00Z', now)).toBeNull();
    expect(teeOffProximity('2026-07-20T07:00:00Z', now)).toBeNull();
  });

  it('returns null for a tee-off whose Oslo day already passed', () => {
    expect(teeOffProximity('2026-06-22T07:00:00Z', now)).toBeNull();
  });

  it('is DST-stable across the spring-forward boundary', () => {
    // Norway springs forward 2026-03-29 02:00→03:00. Winter side = UTC+1.
    const winterNow = new Date('2026-03-27T12:00:00Z'); // Oslo 13:00 Fri 2026-03-27 (UTC+1)
    // tee-off two calendar days later, across the DST switch (Sun is the switch day)
    expect(teeOffProximity('2026-03-29T11:00:00Z', winterNow)).toEqual({ kind: 'days', days: 2 });
  });
});
