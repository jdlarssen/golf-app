import { describe, it, expect } from 'vitest';
import {
  countRoundAchievements,
  parForGender,
  EMPTY_ACHIEVEMENTS,
  type HoleScore,
} from './achievements';
import type { CourseHoleRow } from '@/lib/supabase/queryFragments';

const hole = (holeNumber: number, par: number, strokes: number | null): HoleScore => ({
  holeNumber,
  par,
  strokes,
});

describe('countRoundAchievements — per-hole brags', () => {
  it.each([
    ['hole-in-one (par 3)', 3, 1, { holeInOne: 1, eagle: 1, birdie: 0 }],
    ['hole-in-one (par 4)', 4, 1, { holeInOne: 1, eagle: 1, birdie: 0 }],
    ['eagle (par 5, 3 strokes)', 5, 3, { holeInOne: 0, eagle: 1, birdie: 0 }],
    ['birdie (par 4, 3 strokes)', 4, 3, { holeInOne: 0, eagle: 0, birdie: 1 }],
    ['par (no brag)', 4, 4, { holeInOne: 0, eagle: 0, birdie: 0 }],
    ['bogey (no brag)', 4, 5, { holeInOne: 0, eagle: 0, birdie: 0 }],
  ])('%s', (_label, par, strokes, expected) => {
    const a = countRoundAchievements([hole(1, par, strokes)]);
    expect(a.holeInOne).toBe(expected.holeInOne);
    expect(a.eagle).toBe(expected.eagle);
    expect(a.birdie).toBe(expected.birdie);
  });

  it('counts a snowman on exactly 8 strokes, regardless of par', () => {
    const a = countRoundAchievements([hole(1, 4, 8), hole(2, 5, 8), hole(3, 3, 7)]);
    expect(a.snowman).toBe(2);
  });

  it('ignores unplayed holes (null strokes) and invalid par (0)', () => {
    const a = countRoundAchievements([hole(1, 4, null), hole(2, 0, 3), hole(3, 4, 1)]);
    expect(a.holeInOne).toBe(1);
    expect(a.birdie).toBe(0);
    expect(a.eagle).toBe(1);
  });

  it('does not mutate the shared EMPTY_ACHIEVEMENTS constant', () => {
    countRoundAchievements([hole(1, 4, 3)]);
    expect(EMPTY_ACHIEVEMENTS).toEqual({
      holeInOne: 0,
      eagle: 0,
      birdie: 0,
      turkey: 0,
      snowman: 0,
    });
  });
});

describe('countRoundAchievements — turkey (3 consecutive birdie-or-better)', () => {
  const birdieHoles = (count: number, startHole = 1): HoleScore[] =>
    Array.from({ length: count }, (_, i) => hole(startHole + i, 4, 3));

  it('counts one turkey for exactly 3 consecutive birdies', () => {
    expect(countRoundAchievements(birdieHoles(3)).turkey).toBe(1);
  });

  it('counts two non-overlapping turkeys for 6 consecutive birdies', () => {
    expect(countRoundAchievements(birdieHoles(6)).turkey).toBe(2);
  });

  it('does not count a turkey for only 2 consecutive birdies', () => {
    expect(countRoundAchievements(birdieHoles(2)).turkey).toBe(0);
  });

  it('breaks the streak on a hole-number gap (unplayed hole between)', () => {
    const a = countRoundAchievements([hole(1, 4, 3), hole(2, 4, 3), hole(4, 4, 3)]);
    expect(a.turkey).toBe(0);
  });

  it('counts eagle-or-better as qualifying for the streak', () => {
    const a = countRoundAchievements([hole(1, 5, 3), hole(2, 4, 3), hole(3, 3, 1)]);
    expect(a.turkey).toBe(1);
  });
});

describe('parForGender', () => {
  const h: CourseHoleRow = {
    hole_number: 1,
    par_mens: 4,
    par_ladies: 5,
    par_juniors: 3,
    stroke_index: 7,
  };

  it.each([
    ['mens', 'mens', 4],
    ['ladies', 'ladies', 5],
    ['juniors', 'juniors', 3],
    ['null falls back to mens', null, 4],
  ] as const)('%s', (_label, gender, expected) => {
    expect(parForGender(h, gender)).toBe(expected);
  });
});
