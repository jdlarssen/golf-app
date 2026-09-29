import { describe, it, expect } from 'vitest';
import { computeStablefordPoints } from '@/lib/scoring/modes/stableford';
import { computeModifiedStablefordPoints } from '@/lib/scoring/modes/modifiedStableford';
import { stablefordPointsFnFor, stablefordPointsForCard } from './railPoints';

describe('stablefordPointsFnFor', () => {
  it('uses the modified table for modified stableford', () => {
    expect(stablefordPointsFnFor('modified_stableford')).toBe(
      computeModifiedStablefordPoints,
    );
  });

  it.each(['stableford', 'solo_strokeplay', 'best_ball'] as const)(
    'uses the standard table for %s',
    (mode) => {
      expect(stablefordPointsFnFor(mode)).toBe(computeStablefordPoints);
    },
  );
});

describe('stablefordPointsForCard', () => {
  it.each([
    // par 4, no strokes on the hole: gross = net
    { mode: 'stableford', score: 3, extra: 0, points: 3 },
    { mode: 'stableford', score: 4, extra: 0, points: 2 },
    { mode: 'stableford', score: 6, extra: 0, points: 0 },
    // one stroke on the hole: a gross bogey is a net par
    { mode: 'stableford', score: 5, extra: 1, points: 2 },
    // plus handicap gives a stroke back: a gross par is a net bogey
    { mode: 'stableford', score: 4, extra: -1, points: 1 },
    { mode: 'modified_stableford', score: 3, extra: 0, points: 2 },
    { mode: 'modified_stableford', score: 5, extra: 0, points: -1 },
  ] as const)(
    '$mode, par 4, $score strokes with $extra extra → $points',
    ({ mode, score, extra, points }) => {
      expect(
        stablefordPointsForCard({
          card: { score, extraStrokes: extra },
          par: 4,
          gameMode: mode,
          isStableford: true,
        }),
      ).toBe(points);
    },
  );

  it('is null without a score', () => {
    expect(
      stablefordPointsForCard({
        card: { score: null, extraStrokes: 0 },
        par: 4,
        gameMode: 'stableford',
        isStableford: true,
      }),
    ).toBeNull();
  });

  it('is null outside the stableford family', () => {
    expect(
      stablefordPointsForCard({
        card: { score: 4, extraStrokes: 0 },
        par: 4,
        gameMode: 'solo_strokeplay',
        isStableford: false,
      }),
    ).toBeNull();
  });
});
