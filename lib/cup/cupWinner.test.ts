import { describe, it, expect } from 'vitest';
import { cupWinnerFromPoints } from './cupWinner';

describe('cupWinnerFromPoints (#2214)', () => {
  it.each([
    [5.5, 5, 1],
    [4.5, 6, 2],
    [5, 5, null],
    [0, 0, null],
  ])('%s–%s → %s', (team1, team2, winner) => {
    expect(cupWinnerFromPoints(team1, team2)).toBe(winner);
  });
});
