import { describe, it, expect } from 'vitest';
import { matchDifferenceStrokes, usesMatchDifference } from './matchStrokes';
import type { GameModeConfig } from './modes/types';

const FOURBALL_NEW: GameModeConfig = {
  kind: 'fourball_matchplay',
  team_size: 2,
  teams_count: 2,
  allowance_pct: 90,
  match_strokes: 'difference',
};
const FOURBALL_OLD: GameModeConfig = {
  kind: 'fourball_matchplay',
  team_size: 2,
  teams_count: 2,
  allowance_pct: 90,
};
const ROUND_ROBIN_NEW: GameModeConfig = {
  kind: 'round_robin',
  team_size: 1,
  teams_count: 4,
  allowance_pct: 90,
  match_strokes: 'difference',
};
const SINGLES_NEW: GameModeConfig = {
  kind: 'singles_matchplay',
  team_size: 1,
  teams_count: 2,
  match_strokes: 'difference',
};
const SINGLES_OLD: GameModeConfig = { kind: 'singles_matchplay', team_size: 1, teams_count: 2 };

describe('usesMatchDifference (#2997, F15)', () => {
  it('is true for a new singles, four-ball and Round Robin match', () => {
    expect([SINGLES_NEW, FOURBALL_NEW, ROUND_ROBIN_NEW].map(usesMatchDifference)).toEqual([
      true,
      true,
      true,
    ]);
  });

  it('is false for a match created before the flag', () => {
    expect([SINGLES_OLD, FOURBALL_OLD].map(usesMatchDifference)).toEqual([false, false]);
  });

  it('is false for a format without the rule, even with a stray key', () => {
    const stray = {
      kind: 'foursomes_matchplay',
      team_size: 2,
      teams_count: 2,
      allowance_pct: 50,
      match_strokes: 'difference',
    } as unknown as GameModeConfig;
    expect(usesMatchDifference(stray)).toBe(false);
  });
});

describe('matchDifferenceStrokes (#2997, F15: NGF vedlegg C s. 76, s. 8)', () => {
  // C/2 eksempel 2 at 90 %: 10, 18, 27 and 39 give 0, 7, 15 and 26.
  it.each([
    [10, 0],
    [18, 7],
    [27, 15],
    [39, 26],
  ])('a new match at 90 %% with the lowest on 10: %d gets %d', (basis, strokes) => {
    expect(matchDifferenceStrokes(FOURBALL_NEW, basis, 10, 90)).toBe(strokes);
  });

  // The share goes on the difference: 85 % of 3 is 2,55, so 3. Each player's
  // own share would give round(3,4) − round(0,85) = 2.
  it('takes the share of the difference, not the difference of the shares', () => {
    expect(matchDifferenceStrokes(FOURBALL_NEW, 4, 1, 85)).toBe(3);
  });

  // C/3: +4 (stored −4), 2, 11 and 23 at 90 % give 0, 5, 14 and 24.
  it.each([
    [-4, 0],
    [2, 5],
    [11, 14],
    [23, 24],
  ])('a plus handicap is the lowest and plays off 0: %d gets %d', (basis, strokes) => {
    expect(matchDifferenceStrokes(FOURBALL_NEW, basis, -4, 90)).toBe(strokes);
  });

  it('gives two players who share the lowest handicap 0 each', () => {
    expect(matchDifferenceStrokes(FOURBALL_NEW, 10, 10, 90)).toBe(0);
  });

  it('rounds once on the unrounded basis (F16): 90 % of 20,907 − 9,513 is 10,25, so 10', () => {
    expect(matchDifferenceStrokes(FOURBALL_NEW, 20.907, 9.513, 90)).toBe(10);
  });

  it('rounds an exact half up: 50 % of 21 is 10,5, so 11', () => {
    expect(matchDifferenceStrokes(FOURBALL_NEW, 21, 0, 50)).toBe(11);
  });

  it('a match created before keeps each player’s own share: 90 % of 39 is 35', () => {
    expect(matchDifferenceStrokes(FOURBALL_OLD, 39, 10, 90)).toBe(35);
  });

  it('a match created before takes the own share of the unrounded basis once', () => {
    // 90 % of 20,5 is 18,45 → 18; the rounded 21 would give 18,9 → 19.
    expect(matchDifferenceStrokes(FOURBALL_OLD, 20.5, 0, 90)).toBe(18);
  });

  it('singles at 100 % is the plain difference, and the own handicap without the flag', () => {
    expect(matchDifferenceStrokes(SINGLES_NEW, 20, 5, 100)).toBe(15);
    expect(matchDifferenceStrokes(SINGLES_OLD, 20, 5, 100)).toBe(20);
  });
});
