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
  type CountBucket,
  type Goal,
  type Level,
} from './recommendFormat';
import { fitsPlayerCount } from '@/lib/wizard/fitsPlayerCount';
import { TEAM_FORMAT_PLAYER_CAP } from '@/lib/games/teamFormatLimits';

// mode, then `*` = not every count in the bucket, `†` = the fallback.
type Expected = string;

// Columns: compete even/uneven, team even/uneven, stakes even/uneven.
const TABLE: Record<CountBucket, [Expected, Expected, Expected, Expected, Expected, Expected]> = {
  '2': ['singles_matchplay', 'stableford', 'best_ball', 'best_ball', 'nassau', 'bingo_bango_bongo'],
  '3': ['solo_strokeplay', 'stableford', 'stableford†', 'stableford†', 'wolf', 'bingo_bango_bongo'],
  '4': ['solo_strokeplay', 'stableford', 'fourball_matchplay', 'texas_scramble', 'wolf', 'bingo_bango_bongo'],
  '5-12': ['solo_strokeplay', 'stableford', 'best_ball*', 'texas_scramble', 'nassau', 'bingo_bango_bongo'],
  '13+': ['solo_strokeplay', 'stableford', 'best_ball*', 'texas_scramble', 'nassau*', 'bingo_bango_bongo*'],
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
