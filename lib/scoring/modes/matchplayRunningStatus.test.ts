import { describe, expect, it } from 'vitest';
import {
  runningMatchStatus,
  runningStatusLabel,
} from './matchplayRunningStatus';
import type { MatchplayHoleResult } from './types';

const s1: MatchplayHoleResult = 'side1_wins';
const s2: MatchplayHoleResult = 'side2_wins';
const t: MatchplayHoleResult = 'tied';
const u: MatchplayHoleResult = 'unplayed';

describe('runningMatchStatus', () => {
  it('akkumulerer +1/-1 per vunnet hull og holder stillingen på delte hull', () => {
    expect(runningMatchStatus([s1, s1, t, s2])).toEqual([1, 2, 2, 1]);
  });

  it('følger eierens eksempelsekvens 1up→2up→3up→2up→1up→AS', () => {
    expect(runningMatchStatus([s1, s1, s1, s2, s2, s2])).toEqual([
      1, 2, 3, 2, 1, 0,
    ]);
  });

  it('returnerer null for uspilte hull uten å endre stillingen — også midt i sekvensen', () => {
    expect(runningMatchStatus([s1, u, s2, u])).toEqual([1, null, 0, null]);
  });

  it('teller negativt når side 2 leder', () => {
    expect(runningMatchStatus([s2, s2, s1])).toEqual([-1, -2, -1]);
  });

  it('håndterer tom liste og kun-uspilte hull', () => {
    expect(runningMatchStatus([])).toEqual([]);
    expect(runningMatchStatus([u, u])).toEqual([null, null]);
  });
});

describe('runningStatusLabel', () => {
  it.each([
    [0, 'AS'],
    [1, '1up'],
    [3, '3up'],
    [-2, '2up'],
  ])('formatterer %i som «%s»', (holesUp, expected) => {
    expect(runningStatusLabel(holesUp)).toBe(expected);
  });
});
