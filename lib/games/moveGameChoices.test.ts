import { describe, it, expect } from 'vitest';
import { moveGameChoices, movedTeeOffIso } from './moveGameChoices';

// #2480: the quick choices on «Flytt runden». Type A: the round's own day,
// the day after and the same weekday a week later; its own clock time and an
// hour either side. Days are Oslo calendar days, and the time is a wall-clock
// time that keeps across a clock change.

describe('moveGameChoices', () => {
  it('offers the day, the day after and a week later, and the time with an hour either side', () => {
    // Saturday 3 October 2026, 09:00 in Oslo (summer time).
    expect(moveGameChoices('2026-10-03T07:00:00.000Z')).toEqual({
      currentDay: '2026-10-03',
      currentTime: '09:00',
      days: ['2026-10-03', '2026-10-04', '2026-10-10'],
      times: ['08:00', '09:00', '10:00'],
    });
  });

  it('keeps the minutes and wraps the clock past midnight', () => {
    expect(moveGameChoices('2026-06-12T22:30:00.000Z').times).toEqual(['23:30', '00:30', '01:30']);
    expect(moveGameChoices('2026-06-12T22:30:00.000Z').currentDay).toBe('2026-06-13');
  });

  it('counts Oslo days across the end of a month and the end of a year', () => {
    expect(moveGameChoices('2026-12-31T08:00:00.000Z').days).toEqual([
      '2026-12-31',
      '2027-01-01',
      '2027-01-07',
    ]);
  });
});

describe('movedTeeOffIso', () => {
  it('reads the chosen day and time as Oslo wall-clock, on either side of the clock change', () => {
    expect(movedTeeOffIso('2026-10-24', '09:00')).toBe('2026-10-24T07:00:00.000Z');
    expect(movedTeeOffIso('2026-10-25', '09:00')).toBe('2026-10-25T08:00:00.000Z');
  });

  it('refuses a day or a time that is not one', () => {
    expect(movedTeeOffIso('', '09:00')).toBeNull();
    expect(movedTeeOffIso('2026-10-24', '9')).toBeNull();
    expect(movedTeeOffIso('24.10.2026', '09:00')).toBeNull();
    expect(movedTeeOffIso('2026-02-30', '09:00')).toBeNull();
    expect(movedTeeOffIso('2026-10-24', '25:00')).toBeNull();
  });
});
