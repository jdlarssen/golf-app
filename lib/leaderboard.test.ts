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

  // #2217 (D5): a back9 game has holes 10–18 only. Filled by POSITION, they
  // landed on slots 0–8 and the back9/back6/back3/hole-18 tiers read 0 for
  // every team, so the board showed a shared 1st place while the stored
  // result (bestBall.ts, indexed on hole number) had broken the tie.
  it('breaks a back9 tie on the last holes, like the stored result', () => {
    const back9Holes = holes.filter((h) => h.holeNumber >= 10);
    const players = [player('a', 1), player('b', 2)];
    const scores: LbScore[] = back9Holes.flatMap((h) => [
      // Team 1: 6-6-6 on 10–12, then 3s → 36. Better on 13–18.
      { userId: 'a', holeNumber: h.holeNumber, strokes: h.holeNumber <= 12 ? 6 : 3 },
      // Team 2: 4 on every hole → 36.
      { userId: 'b', holeNumber: h.holeNumber, strokes: 4 },
    ]);

    const lines = computeLeaderboard({ mode: 'netto', players, holes: back9Holes, scores });
    const t1 = lines.find((l) => l.teamNumber === 1)!;
    const t2 = lines.find((l) => l.teamNumber === 2)!;

    expect(t1.total).toBe(36);
    expect(t2.total).toBe(36);
    expect(t1.rank).toBe(1);
    expect(t2.rank).toBe(2);
    expect(t1.tiedWith).toEqual([]);
    expect(t2.tiedWith).toEqual([]);
  });
});

// #2625: a best ball game stamped with `ranking: 'net_to_par'` ranks on the
// team net against par over the holes each team has played — the same rule as
// the engine (`lib/scoring/modes/bestBall.ts`). The board, «Hull for hull» and
// the CSV read this aggregator, so it takes the rule from the caller.
describe('computeLeaderboard — ranking: net_to_par (#2625)', () => {
  const players = [player('a1', 1), player('a2', 1), player('b1', 2), player('b2', 2)];
  /** The partner always takes one more, so the first card is the best ball. */
  function pairCards(best: string, partner: string, gross: number[]): LbScore[] {
    return gross.flatMap((g, i) => [
      { userId: best, holeNumber: i + 1, strokes: g },
      { userId: partner, holeNumber: i + 1, strokes: g + 1 },
    ]);
  }
  // The issue's example: pair 1 net 7 after 3 holes (−5), pair 2 net 17
  // after 6 holes (−7).
  const scores = [...pairCards('a1', 'a2', [2, 2, 3]), ...pairCards('b1', 'b2', [3, 3, 3, 3, 3, 2])];
  const byTeam = (lines: ReturnType<typeof computeLeaderboard>) =>
    lines.map((l) => [l.teamNumber, l.rank, l.toPar, l.total]);

  it.each(['netto', 'brutto'] as const)('%s: pair 2 (−7 after 6) ranks ahead of pair 1 (−5 after 3) with the flag', (mode) => {
    const lines = computeLeaderboard({ mode, players, holes, scores, ranking: 'net_to_par' });
    expect(byTeam(lines)).toEqual([
      [1, 2, -5, 7],
      [2, 1, -7, 17],
    ]);
  });

  it.each(['netto', 'brutto'] as const)('%s: without the flag the same round keeps today’s order', (mode) => {
    const lines = computeLeaderboard({ mode, players, holes, scores });
    expect(byTeam(lines)).toEqual([
      [1, 1, -5, 7],
      [2, 2, -7, 17],
    ]);
  });

  it('a pair without a single hole has toPar null and still ranks last with the flag (#635)', () => {
    const lines = computeLeaderboard({
      mode: 'netto',
      players,
      holes,
      scores: pairCards('a1', 'a2', [6]),
      ranking: 'net_to_par',
    });
    expect(byTeam(lines)).toEqual([
      [1, 1, 2, 6],
      [2, 2, null, 0],
    ]);
  });
});
