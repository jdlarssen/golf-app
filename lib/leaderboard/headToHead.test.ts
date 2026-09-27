import { describe, expect, it } from 'vitest';
import { headToHeadSummary, type HeadToHeadSummary } from './headToHead';

// Type A for the duel card's math (#2226): winner, the tug-of-war bar
// (baseline shift for negative totals, inverted when lowest wins) and the
// verdict parts. HeadToHeadResult only maps the verdict kind to copy.

type Row = {
  a: number;
  b: number;
  winnerUserId: string | null;
  lowerWins: boolean;
  expected: HeadToHeadSummary;
};

const rows: Row[] = [
  {
    a: 5, b: 3, winnerUserId: 'u1', lowerWins: false,
    expected: {
      winner: 'a', pctA: 63, pctB: 37, hasNegativeScore: false,
      verdict: { kind: 'win', winner: 'a', winnerScore: '5', loserScore: '3' },
    },
  },
  {
    a: 3, b: 5, winnerUserId: 'u2', lowerWins: false,
    expected: {
      winner: 'b', pctA: 38, pctB: 62, hasNegativeScore: false,
      verdict: { kind: 'win', winner: 'b', winnerScore: '5', loserScore: '3' },
    },
  },
  {
    a: 3, b: 3, winnerUserId: null, lowerWins: false,
    expected: {
      winner: 'tie', pctA: 50, pctB: 50, hasNegativeScore: false,
      verdict: { kind: 'tie', scoreA: '3', scoreB: '3' },
    },
  },
  {
    a: 4, b: 4, winnerUserId: 'u2', lowerWins: false,
    expected: {
      winner: 'b', pctA: 50, pctB: 50, hasNegativeScore: false,
      verdict: { kind: 'winTiebreak', winner: 'b' },
    },
  },
  {
    a: 78, b: 85, winnerUserId: 'u1', lowerWins: true,
    expected: {
      winner: 'a', pctA: 52, pctB: 48, hasNegativeScore: false,
      verdict: { kind: 'win', winner: 'a', winnerScore: '78', loserScore: '85' },
    },
  },
  {
    a: 2, b: -3, winnerUserId: 'u1', lowerWins: false,
    expected: {
      winner: 'a', pctA: 100, pctB: 0, hasNegativeScore: true,
      verdict: { kind: 'win', winner: 'a', winnerScore: '2', loserScore: '−3' },
    },
  },
  {
    a: 0, b: 0, winnerUserId: null, lowerWins: false,
    expected: {
      winner: 'tie', pctA: 50, pctB: 50, hasNegativeScore: false,
      verdict: { kind: 'tie', scoreA: '0', scoreB: '0' },
    },
  },
  {
    a: -1, b: -4, winnerUserId: 'u1', lowerWins: false,
    expected: {
      winner: 'a', pctA: 100, pctB: 0, hasNegativeScore: true,
      verdict: { kind: 'win', winner: 'a', winnerScore: '−1', loserScore: '−4' },
    },
  },
];

describe('headToHeadSummary', () => {
  it.each(rows)(
    'A $a vs B $b, winner $winnerUserId, lowerWins $lowerWins',
    ({ a, b, winnerUserId, lowerWins, expected }) => {
      expect(
        headToHeadSummary({
          sideA: { userId: 'u1', score: a },
          sideB: { userId: 'u2', score: b },
          winnerUserId,
          lowerWins,
        }),
      ).toEqual(expected);
    },
  );
});
