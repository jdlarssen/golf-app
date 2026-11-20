/**
 * Type-A tests for recommendFormat (#2328): the format the helper on
 * /spillformater suggests for every one of its 30 answers.
 *
 * The table is read off today's `fitsPlayerCount` (Texas fits every count in
 * 5–12 and 13–40 since teams one short, #2569). A change to a format's player
 * limits that moves a suggestion shows up here first.
 */

import { describe, expect, it } from 'vitest';
import {
  PLAYER_COUNT_BUCKETS,
  bucketCounts,
  recommendFormat,
  recommendFormatForCount,
  type CountBucket,
  type Goal,
  type Level,
} from './recommendFormat';
import { fitsPlayerCount } from '@/lib/wizard/fitsPlayerCount';
import { TEAM_FORMAT_PLAYER_CAP } from '@/lib/games/teamFormatLimits';

const COUNTS = Array.from({ length: TEAM_FORMAT_PLAYER_CAP - 1 }, (_, i) => i + 2);
const bucketOf = (n: number): CountBucket =>
  n <= 4 ? (String(n) as CountBucket) : n <= 12 ? '5-12' : '13+';

// mode, then `*` = not every count in the bucket, `†` = the fallback.
type Expected = string;

// Columns: compete even/uneven, team even/uneven, stakes even/uneven.
const TABLE: Record<CountBucket, [Expected, Expected, Expected, Expected, Expected, Expected]> = {
  '2': ['singles_matchplay', 'stableford', 'best_ball', 'best_ball', 'nassau', 'bingo_bango_bongo'],
  '3': ['solo_strokeplay', 'stableford', 'stableford†', 'stableford†', 'wolf', 'bingo_bango_bongo'],
  '4': ['solo_strokeplay', 'stableford', 'fourball_matchplay', 'texas_scramble', 'wolf', 'bingo_bango_bongo'],
  '5-12': ['solo_strokeplay', 'stableford', 'best_ball*', 'texas_scramble', 'nassau', 'stableford†'],
  '13+': ['solo_strokeplay', 'stableford', 'best_ball*', 'texas_scramble', 'nassau*', 'stableford†'],
};

const COLUMNS: Array<[Goal, Level]> = [
  ['compete', 'even'],
  ['compete', 'uneven'],
  ['team', 'even'],
  ['team', 'uneven'],
  ['stakes', 'even'],
  ['stakes', 'uneven'],
];

const CASES = PLAYER_COUNT_BUCKETS.flatMap((bucket) =>
  COLUMNS.map(([goal, level], i) => ({ bucket, goal, level, expected: TABLE[bucket][i] })),
);

describe('recommendFormat — the whole table', () => {
  it('covers all 30 answers', () => {
    expect(CASES).toHaveLength(30);
  });

  it.each(CASES)('$bucket · $level · $goal → $expected', ({ bucket, goal, level, expected }) => {
    const r = recommendFormat({ bucket, level, goal });
    const mode = expected.replace(/[*†]$/, '');
    expect(r.mode).toBe(mode);
    expect(r.fitsEveryCount).toBe(!expected.endsWith('*'));
    expect(r.isFallback).toBe(expected.endsWith('†'));
  });
});

describe('recommendFormat — never a format that cannot be played', () => {
  it.each(CASES)('$bucket · $level · $goal fits at least one count', ({ bucket, goal, level }) => {
    const { mode } = recommendFormat({ bucket, level, goal });
    expect(bucketCounts(bucket).some((n) => fitsPlayerCount(mode, n))).toBe(true);
  });
});

describe('recommendFormat — exactCount', () => {
  it.each([
    ['2', 2],
    ['3', 3],
    ['4', 4],
    ['5-12', null],
    ['13+', null],
  ] as const)('%s → %s', (bucket, expected) => {
    expect(recommendFormat({ bucket, level: 'uneven', goal: 'team' }).exactCount).toBe(expected);
  });
});

describe('bucketCounts', () => {
  it('5-12 is 5 through 12', () => {
    expect(bucketCounts('5-12')).toEqual([5, 6, 7, 8, 9, 10, 11, 12]);
  });

  it('13+ stops at the team format cap, the same ceiling as the wizard', () => {
    const counts = bucketCounts('13+');
    expect(counts[0]).toBe(13);
    expect(counts.at(-1)).toBe(TEAM_FORMAT_PLAYER_CAP);
  });
});

describe('recommendFormatForCount (#2462)', () => {
  const ANSWERS = COLUMNS.map(([goal, level]) => ({ goal, level }));
  const forCount = (count: number, level: Level, goal: Goal) =>
    recommendFormatForCount({ count, level, goal });

  it.each(COUNTS.flatMap((count) => ANSWERS.map((a) => ({ count, ...a }))))(
    '$count · $level · $goal gives a format that fits the count',
    ({ count, goal, level }) => {
      const r = forCount(count, level, goal);
      expect(fitsPlayerCount(r.mode, count)).toBe(true);
      expect(r.exactCount).toBe(count);
      expect(r.fitsEveryCount).toBe(true);
    },
  );

  it.each([2, 3, 4])('%i players: the same answer as recommendFormat, nothing displaced', (count) => {
    for (const { goal, level } of ANSWERS) {
      expect(forCount(count, level, goal)).toEqual({
        ...recommendFormat({ bucket: bucketOf(count), level, goal }),
        displaced: null,
      });
    }
  });

  it('5–40: the bucket answer whenever it fits the count, nothing displaced', () => {
    for (const count of COUNTS.filter((n) => n >= 5)) {
      for (const { goal, level } of ANSWERS) {
        const bucket = recommendFormat({ bucket: bucketOf(count), level, goal });
        if (!fitsPlayerCount(bucket.mode, count)) continue;
        const r = forCount(count, level, goal);
        expect(r.mode).toBe(bucket.mode);
        expect(r.displaced).toBeNull();
      }
    }
  });

  it('6 and 8 · even · team stay on best ball, as /spillformater says', () => {
    for (const count of [6, 8, 12, 20]) {
      expect(forCount(count, 'even', 'team')).toMatchObject({ mode: 'best_ball', displaced: null });
    }
  });

  it('odd counts · even · team: best ball does not fit, Texas scramble is the reserve', () => {
    for (const count of [5, 7, 9, 11, 13, 17]) {
      expect(forCount(count, 'even', 'team')).toMatchObject({
        mode: 'texas_scramble',
        displaced: 'best_ball',
        isFallback: false,
      });
    }
  });

  it('5 · even · stakes stays on Nassau', () => {
    expect(forCount(5, 'even', 'stakes')).toMatchObject({ mode: 'nassau', displaced: null });
  });

  it('17 · stakes: no candidate fits the count, so Stableford with the bucket answer displaced', () => {
    // The bucket's 13+ answer for stakes · even is Nassau (fits 16 at most): 17 has no candidate.
    expect(forCount(17, 'even', 'stakes')).toMatchObject({
      mode: 'stableford',
      isFallback: true,
      displaced: 'nassau',
    });
    // stakes · uneven has Bingo Bango Bongo alone, and it is one flight (2–4):
    // the bucket answer is already the Stableford fallback, so nothing is displaced.
    expect(forCount(17, 'uneven', 'stakes')).toMatchObject({
      mode: 'stableford',
      isFallback: true,
      displaced: null,
    });
  });

  it('3 · team: Stableford with the fallback flag, nothing displaced', () => {
    expect(forCount(3, 'even', 'team')).toMatchObject({
      mode: 'stableford',
      isFallback: true,
      displaced: null,
    });
  });

  it('never adds Texas scramble to the bucket table', () => {
    expect(recommendFormat({ bucket: '5-12', level: 'even', goal: 'team' }).mode).toBe('best_ball');
    expect(recommendFormat({ bucket: '13+', level: 'even', goal: 'team' }).mode).toBe('best_ball');
  });
});
