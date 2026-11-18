/**
 * Type-A tests for recommendFormat (#2328): the format the helper on
 * /spillformater suggests for every one of its 30 answers.
 *
 * The table is read off today's `fitsPlayerCount` (Texas fits every count in
 * 5–12 and 13–40 since teams one short, #2569; #2462 put it last among the
 * even team candidates, so 5–12 and 13+ · even · team say Texas, not best ball). A change to a format's player
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
  '5-12': ['solo_strokeplay', 'stableford', 'texas_scramble', 'texas_scramble', 'nassau', 'bingo_bango_bongo'],
  '13+': ['solo_strokeplay', 'stableford', 'texas_scramble', 'texas_scramble', 'nassau*', 'bingo_bango_bongo*'],
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

  it.each(COUNTS.flatMap((count) => ANSWERS.map((a) => ({ count, ...a }))))(
    '$count · $level · $goal gives a format that fits the count',
    ({ count, goal, level }) => {
      const r = recommendFormatForCount({ count, level, goal });
      expect(fitsPlayerCount(r.mode, count)).toBe(true);
      expect(r.exactCount).toBe(count);
      expect(r.fitsEveryCount).toBe(true);
    },
  );

  it.each([2, 3, 4])('%i players: the same answer as recommendFormat', (count) => {
    for (const { goal, level } of ANSWERS) {
      expect(recommendFormatForCount({ count, level, goal })).toEqual(
        recommendFormat({ bucket: bucketOf(count), level, goal }),
      );
    }
  });

  it('5–40: the bucket answer whenever it fits the count', () => {
    for (const count of COUNTS.filter((n) => n >= 5)) {
      for (const { goal, level } of ANSWERS) {
        const bucket = recommendFormat({ bucket: bucketOf(count), level, goal });
        if (!fitsPlayerCount(bucket.mode, count)) continue;
        expect(recommendFormatForCount({ count, level, goal }).mode).toBe(bucket.mode);
      }
    }
  });

  it('the exact count only takes over when the bucket answer does not fit', () => {
    // best ball fits no odd count, so 5-12 · even · team is no longer best ball
    expect(recommendFormatForCount({ count: 7, level: 'even', goal: 'team' }).mode).toBe('texas_scramble');
    expect(recommendFormatForCount({ count: 6, level: 'even', goal: 'team' }).mode).toBe('texas_scramble');
    expect(recommendFormatForCount({ count: 5, level: 'even', goal: 'stakes' }).mode).toBe('nassau');
  });

  it('locks the three answers the bucket cannot give', () => {
    // Nassau and bingo bango bongo stop at 16 players.
    expect(recommendFormatForCount({ count: 17, level: 'even', goal: 'stakes' })).toMatchObject({
      mode: 'stableford',
      isFallback: true,
    });
    expect(recommendFormatForCount({ count: 17, level: 'uneven', goal: 'stakes' })).toMatchObject({
      mode: 'stableford',
      isFallback: true,
    });
    expect(recommendFormatForCount({ count: 3, level: 'even', goal: 'team' })).toMatchObject({
      mode: 'stableford',
      isFallback: true,
    });
  });
});
