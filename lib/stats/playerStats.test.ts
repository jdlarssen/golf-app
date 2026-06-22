import { describe, it, expect } from 'vitest';
import {
  computePlayerStats,
  type HoleScore,
  type RoundInput,
} from './playerStats';

/** One hole with an explicit par + strokes. */
const hole = (holeNumber: number, par: number, strokes: number | null): HoleScore => ({
  holeNumber,
  par,
  strokes,
});

/** A round where every hole is par-4 and you pass the strokes per hole.
 *  `null` strokes model an unplayed hole. */
const par4Round = (strokesPerHole: Array<number | null>): RoundInput => ({
  holes: strokesPerHole.map((s, i) => hole(i + 1, 4, s)),
});

/** A complete, even-par 18-hole round (all par 4, all 4 strokes → total 72). */
const evenPar18 = (): RoundInput => par4Round(Array.from({ length: 18 }, () => 4));

describe('computePlayerStats — roundsPlayed', () => {
  it('counts every finished round, including ones with no scores yet', () => {
    const stats = computePlayerStats([
      evenPar18(),
      { holes: [] }, // finished game the player joined but entered no scores
    ]);
    expect(stats.roundsPlayed).toBe(2);
  });

  it('is 0 for no rounds', () => {
    expect(computePlayerStats([]).roundsPlayed).toBe(0);
  });
});

describe('computePlayerStats — grossAverage & bestRound (complete-18 only)', () => {
  it('averages and finds the min over complete 18-hole rounds', () => {
    const r80 = par4Round([
      // 8 holes of 5, 10 holes of 4 → 8*5 + 10*4 = 80
      ...Array.from({ length: 8 }, () => 5),
      ...Array.from({ length: 10 }, () => 4),
    ]);
    const stats = computePlayerStats([evenPar18(), r80]); // 72 and 80
    expect(stats.grossAverage).toBe(76); // (72+80)/2
    expect(stats.bestRound).toBe(72);
  });

  it('rounds the average to a whole number', () => {
    const r73 = par4Round([5, ...Array.from({ length: 17 }, () => 4)]); // 73
    const stats = computePlayerStats([evenPar18(), r73]); // (72+73)/2 = 72.5 → 73
    expect(stats.grossAverage).toBe(73);
  });

  it('excludes incomplete rounds (<18 non-null strokes) from average/best', () => {
    const incomplete = par4Round([
      ...Array.from({ length: 17 }, () => 3), // 17 birdies, 1 unplayed
      null,
    ]);
    const stats = computePlayerStats([evenPar18(), incomplete]);
    // only the complete 72 counts
    expect(stats.grossAverage).toBe(72);
    expect(stats.bestRound).toBe(72);
  });

  it('excludes 9-hole rounds from average/best', () => {
    const nine = { holes: Array.from({ length: 9 }, (_, i) => hole(i + 1, 4, 4)) };
    const stats = computePlayerStats([nine]);
    expect(stats.grossAverage).toBeNull();
    expect(stats.bestRound).toBeNull();
  });

  it('returns null average/best when no complete round exists', () => {
    const stats = computePlayerStats([{ holes: [] }]);
    expect(stats.grossAverage).toBeNull();
    expect(stats.bestRound).toBeNull();
  });
});

describe('computePlayerStats — per-hole achievements', () => {
  it.each([
    // [label, par, strokes, expected flags]
    ['hole-in-one (par 3)', 3, 1, { holeInOne: 1, eagle: 1, birdie: 0 }],
    ['hole-in-one (par 4)', 4, 1, { holeInOne: 1, eagle: 1, birdie: 0 }],
    ['eagle (par 5, 3 strokes)', 5, 3, { holeInOne: 0, eagle: 1, birdie: 0 }],
    ['birdie (par 4, 3 strokes)', 4, 3, { holeInOne: 0, eagle: 0, birdie: 1 }],
    ['par (no brag)', 4, 4, { holeInOne: 0, eagle: 0, birdie: 0 }],
    ['bogey (no brag)', 4, 5, { holeInOne: 0, eagle: 0, birdie: 0 }],
  ])('%s', (_label, par, strokes, expected) => {
    const stats = computePlayerStats([{ holes: [hole(1, par, strokes)] }]);
    expect(stats.achievements.holeInOne).toBe(expected.holeInOne);
    expect(stats.achievements.eagle).toBe(expected.eagle);
    expect(stats.achievements.birdie).toBe(expected.birdie);
  });

  it('counts a snowman on exactly 8 strokes, regardless of par', () => {
    const stats = computePlayerStats([
      { holes: [hole(1, 4, 8), hole(2, 5, 8), hole(3, 3, 7)] },
    ]);
    expect(stats.achievements.snowman).toBe(2);
  });

  it('ignores unplayed holes (null strokes) and invalid par (0)', () => {
    const stats = computePlayerStats([
      { holes: [hole(1, 4, null), hole(2, 0, 3), hole(3, 4, 1)] },
    ]);
    // hole 1 null → skipped; hole 2 par 0 → no birdie/eagle; hole 3 HiO
    expect(stats.achievements.holeInOne).toBe(1);
    expect(stats.achievements.birdie).toBe(0);
    expect(stats.achievements.eagle).toBe(1); // hole 3 HiO on par 4
  });

  it('aggregates achievements across multiple rounds', () => {
    const stats = computePlayerStats([
      { holes: [hole(1, 4, 3)] }, // birdie
      { holes: [hole(1, 4, 3), hole(2, 5, 3)] }, // birdie + eagle
    ]);
    expect(stats.achievements.birdie).toBe(2);
    expect(stats.achievements.eagle).toBe(1);
  });
});

describe('computePlayerStats — turkey (3 consecutive birdie-or-better)', () => {
  const birdieHoles = (count: number, startHole = 1): HoleScore[] =>
    Array.from({ length: count }, (_, i) => hole(startHole + i, 4, 3));

  it('counts one turkey for exactly 3 consecutive birdies', () => {
    const stats = computePlayerStats([{ holes: birdieHoles(3) }]);
    expect(stats.achievements.turkey).toBe(1);
  });

  it('counts two non-overlapping turkeys for 6 consecutive birdies', () => {
    const stats = computePlayerStats([{ holes: birdieHoles(6) }]);
    expect(stats.achievements.turkey).toBe(2);
  });

  it('does not count a turkey for only 2 consecutive birdies', () => {
    const stats = computePlayerStats([{ holes: birdieHoles(2) }]);
    expect(stats.achievements.turkey).toBe(0);
  });

  it('breaks the streak on a non-qualifying hole', () => {
    const stats = computePlayerStats([
      {
        holes: [hole(1, 4, 3), hole(2, 4, 3), hole(3, 4, 4), hole(4, 4, 3)],
      },
    ]); // birdie, birdie, par, birdie → no run of 3
    expect(stats.achievements.turkey).toBe(0);
  });

  it('breaks the streak on a hole-number gap (unplayed hole between)', () => {
    const stats = computePlayerStats([
      { holes: [hole(1, 4, 3), hole(2, 4, 3), hole(4, 4, 3)] }, // hole 3 missing
    ]);
    expect(stats.achievements.turkey).toBe(0);
  });

  it('counts eagle-or-better as qualifying for the streak', () => {
    const stats = computePlayerStats([
      { holes: [hole(1, 5, 3), hole(2, 4, 3), hole(3, 3, 1)] }, // eagle, birdie, HiO
    ]);
    expect(stats.achievements.turkey).toBe(1);
  });

  it('counts turkeys per round, not across round boundaries', () => {
    const stats = computePlayerStats([
      { holes: birdieHoles(2, 17) }, // holes 17,18 birdie
      { holes: birdieHoles(1, 1) }, // hole 1 birdie — different round
    ]);
    expect(stats.achievements.turkey).toBe(0);
  });
});

describe('computePlayerStats — empty input', () => {
  it('returns zeroed stats', () => {
    expect(computePlayerStats([])).toEqual({
      roundsPlayed: 0,
      grossAverage: null,
      bestRound: null,
      achievements: { holeInOne: 0, eagle: 0, birdie: 0, turkey: 0, snowman: 0 },
    });
  });
});
