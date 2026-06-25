import { describe, it, expect } from 'vitest';
import {
  computeCourseStats,
  type CourseRoundInput,
} from './courseStats';

/** One finished round on a course. `completeBrutto = null` ⇒ not a complete
 *  18-hole round, so it must not feed snitt/beste/antall. */
const round = (
  courseId: string | null,
  courseName: string,
  completeBrutto: number | null,
): CourseRoundInput => ({ courseId, courseName, completeBrutto });

describe('computeCourseStats — grouping & metrics', () => {
  it('returns [] for no rounds', () => {
    expect(computeCourseStats([])).toEqual([]);
  });

  it('groups complete rounds by course: antall, brutto-snitt, brutto-beste', () => {
    const stats = computeCourseStats([
      round('c1', 'Oslo GK', 82),
      round('c1', 'Oslo GK', 80),
      round('c1', 'Oslo GK', 84),
    ]);
    expect(stats).toEqual([
      { courseId: 'c1', courseName: 'Oslo GK', rounds: 3, average: 82, best: 80 },
    ]);
  });

  it('rounds the brutto average to nearest integer', () => {
    // 81 + 84 = 165 / 2 = 82.5 → 83
    const stats = computeCourseStats([
      round('c1', 'Oslo GK', 81),
      round('c1', 'Oslo GK', 84),
    ]);
    expect(stats[0].average).toBe(83);
  });

  it('a single round yields snitt = beste = that round', () => {
    const stats = computeCourseStats([round('c1', 'Oslo GK', 79)]);
    expect(stats[0]).toMatchObject({ rounds: 1, average: 79, best: 79 });
  });
});

describe('computeCourseStats — exclusions', () => {
  it('excludes rounds that are not complete 18-hole rounds (completeBrutto null)', () => {
    const stats = computeCourseStats([
      round('c1', 'Oslo GK', 82),
      round('c1', 'Oslo GK', null), // 9-hole / incomplete — must not count
    ]);
    expect(stats).toEqual([
      { courseId: 'c1', courseName: 'Oslo GK', rounds: 1, average: 82, best: 82 },
    ]);
  });

  it('drops a course entirely when it has no complete rounds', () => {
    const stats = computeCourseStats([
      round('c1', 'Oslo GK', null),
      round('c1', 'Oslo GK', null),
    ]);
    expect(stats).toEqual([]);
  });

  it('excludes rounds with a null courseId (cannot be grouped)', () => {
    const stats = computeCourseStats([
      round(null, 'Ukjent bane', 90),
      round('c1', 'Oslo GK', 82),
    ]);
    expect(stats).toEqual([
      { courseId: 'c1', courseName: 'Oslo GK', rounds: 1, average: 82, best: 82 },
    ]);
  });
});

describe('computeCourseStats — sorting', () => {
  it('sorts by antall descending, then course name ascending', () => {
    const stats = computeCourseStats([
      round('c2', 'Bergen GK', 85),
      round('c1', 'Oslo GK', 82),
      round('c1', 'Oslo GK', 80),
      round('c3', 'Asker GK', 88),
    ]);
    // c1 has 2 rounds → first; c2/c3 tie at 1 → alphabetical (Asker before Bergen)
    expect(stats.map((s) => s.courseId)).toEqual(['c1', 'c3', 'c2']);
  });
});
