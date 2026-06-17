import { describe, it, expect } from 'vitest';
import { computeLeaderboard, type LbHole, type LbPlayer, type LbScore } from './leaderboard';

// Type-A unit tests for the legacy best-ball aggregator that powers the live
// leaderboard page, the champion reveal, profile statistics and the CSV export.
// Regression coverage for #666 (#635 pattern): a team with no scores must NOT
// rank first just because its padded total is 0.

const holes: LbHole[] = Array.from({ length: 18 }, (_, i) => ({
  holeNumber: i + 1,
  par: 4,
  strokeIndex: i + 1,
}));

function player(userId: string, teamNumber: number, courseHandicap = 0): LbPlayer {
  return { userId, name: userId.toUpperCase(), nickname: null, teamNumber, courseHandicap };
}

function scoresFor(userId: string, strokesPerHole: number): LbScore[] {
  return Array.from({ length: 18 }, (_, i) => ({
    userId,
    holeNumber: i + 1,
    strokes: strokesPerHole,
  }));
}

describe('computeLeaderboard', () => {
  it('ranks a team that entered no scores LAST, not first (#666 / #635)', () => {
    const players = [player('a', 1), player('b', 2)];
    // Only team 1 has scores; team 2 entered nothing.
    const scores = scoresFor('a', 4);

    const lines = computeLeaderboard({ mode: 'netto', players, holes, scores });
    const t1 = lines.find((l) => l.teamNumber === 1)!;
    const t2 = lines.find((l) => l.teamNumber === 2)!;

    expect(t1.rank).toBe(1);
    expect(t2.rank).toBe(2);
    expect(t2.missingHoles).toHaveLength(18);
  });

  it('ranks the lower net total first (basic netto)', () => {
    const players = [player('a', 1), player('b', 2)];
    const scores = [...scoresFor('a', 4), ...scoresFor('b', 5)];

    const lines = computeLeaderboard({ mode: 'netto', players, holes, scores });
    const t1 = lines.find((l) => l.teamNumber === 1)!;
    const t2 = lines.find((l) => l.teamNumber === 2)!;

    expect(t1.total).toBe(72);
    expect(t2.total).toBe(90);
    expect(t1.rank).toBe(1);
    expect(t2.rank).toBe(2);
  });

  it('ignores course handicap in brutto mode (extraStrokes forced to 0)', () => {
    const players = [player('a', 1, 18)]; // 1 stroke/hole in netto, 0 in brutto
    const scores = scoresFor('a', 5);

    const brutto = computeLeaderboard({ mode: 'brutto', players, holes, scores });
    const netto = computeLeaderboard({ mode: 'netto', players, holes, scores });

    expect(brutto[0].total).toBe(90); // gross sum, handicap ignored
    expect(netto[0].total).toBe(72); // 5 - 1 per hole
    expect(brutto[0].holes[0].players[0].extraStrokes).toBe(0);
  });
});
