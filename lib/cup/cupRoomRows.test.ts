import { describe, expect, it } from 'vitest';
import { cupProgress, splitCupsForRoom } from './cupRoomRows';

// The «Cuper» rows in the Klubbhus room (#2493).
describe('splitCupsForRoom', () => {
  it.each([
    ['no cups', [], [], 0],
    ['a running and a draft cup are rows', ['active', 'draft'], ['active', 'draft'], 0],
    // A finished cup builds no snapshot: it stands on /admin/cup (15b).
    ['a finished cup is counted, not a row', ['active', 'finished', 'finished'], ['active'], 2],
    ['only finished cups', ['finished'], [], 1],
  ] as const)('%s', (_label, statuses, live, finishedCount) => {
    const cups = statuses.map((status, i) => ({ id: `t${i}`, status }));
    const split = splitCupsForRoom(cups);
    expect(split.live.map((c) => c.status)).toEqual(live);
    expect(split.finishedCount).toBe(finishedCount);
  });
});

describe('cupProgress', () => {
  it.each([
    // «X av N kamper spilt» reads the cup page's own leaderboard numbers.
    ['3 of 8 played', { finishedMatches: 3, remainingMatches: 5 }, { played: 3, total: 8 }],
    ['a draft cup without matches', { finishedMatches: 0, remainingMatches: 0 }, { played: 0, total: 0 }],
    ['no snapshot', null, { played: 0, total: 0 }],
  ] as const)('%s', (_label, leaderboard, expected) => {
    expect(cupProgress(leaderboard)).toEqual(expected);
  });
});
