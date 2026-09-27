import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

// The glue inside the hole page's four live queries (#2226). Each hook calls
// useLiveQuery exactly once, so a plain mockReturnValue stands in for the
// Dexie read — no call counter. HoleClient.test.tsx mocks these hooks by name
// and only tests how the page reacts to what they return.
vi.mock('dexie-react-hooks', () => ({
  useLiveQuery: vi.fn(),
}));

import { useLiveQuery } from 'dexie-react-hooks';
import {
  useHoleCards,
  useMyScoredHoles,
  usePendingSyncCount,
  useSiblingScoredHoles,
} from './holeLiveQueries';
import type { ClientPlayer } from './holeClientProps';

const liveQuery = vi.mocked(useLiveQuery);

function player(userId: string): ClientPlayer {
  return {
    userId,
    name: `Player ${userId}`,
    nickname: null,
    initial: 'P',
    extraStrokes: 0,
    initialStrokes: null,
    initialPutts: null,
    initialClientUpdatedAt: null,
    initialServerUpdatedAt: null,
    submitted: false,
  };
}

function rowsFor(userId: string, holes: number[]) {
  return holes.map((holeNumber) => ({ userId, holeNumber, strokes: 4 }));
}

const range = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => from + i);

beforeEach(() => {
  liveQuery.mockReset();
});

describe('useHoleCards', () => {
  it('lays local row i on player i, and null where a row is missing', () => {
    liveQuery.mockReturnValue([{ strokes: 5, putts: 2 }, undefined]);
    const players = [player('u1'), player('u2')];
    const { result } = renderHook(() => useHoleCards('g1', 3, players));
    expect(result.current.map(({ userId, score, putts }) => ({ userId, score, putts }))).toEqual([
      { userId: 'u1', score: 5, putts: 2 },
      { userId: 'u2', score: null, putts: null },
    ]);
  });
});

describe('useMyScoredHoles', () => {
  const base = {
    gameId: 'g1',
    myUserId: 'u-viewer',
    myFormerTeamRowOwnerIds: [] as string[],
  };

  it('is the union of the server set and my local rows', () => {
    liveQuery.mockReturnValue(rowsFor('u-viewer', [2, 3]));
    const { result } = renderHook(() =>
      useMyScoredHoles({
        ...base,
        gameMode: 'solo_strokeplay',
        myTeamScoreOwnerId: null,
        myScoredHoles: [1, 2],
      }),
    );
    expect([...result.current].sort((a, b) => a - b)).toEqual([1, 2, 3]);
  });

  // #1577: the team's rows live under the captain's user_id.
  it('texas_scramble: the captain’s 18 rows give a non-captain holes 1–18', () => {
    liveQuery.mockReturnValue(rowsFor('a-captain', range(1, 18)));
    const { result } = renderHook(() =>
      useMyScoredHoles({
        ...base,
        gameMode: 'texas_scramble',
        myTeamScoreOwnerId: 'a-captain',
        myScoredHoles: [],
      }),
    );
    expect([...result.current].sort((a, b) => a - b)).toEqual(range(1, 18));
  });

  it('patsome: my own 4BBB holes 1–6 plus the team ball on 7–18 completes the round', () => {
    liveQuery.mockReturnValue([
      ...rowsFor('u-viewer', range(1, 6)),
      ...rowsFor('a-captain', range(7, 18)),
    ]);
    const { result } = renderHook(() =>
      useMyScoredHoles({
        ...base,
        gameMode: 'patsome',
        myTeamScoreOwnerId: 'a-captain',
        myScoredHoles: [],
      }),
    );
    expect([...result.current].sort((a, b) => a - b)).toEqual(range(1, 18));
  });

  it('patsome: the captain’s row on a 4BBB hole does NOT stand in for mine', () => {
    // Hole 5 is 4BBB — only MY ball counts there, so the round is one short.
    liveQuery.mockReturnValue([
      ...rowsFor('u-viewer', [1, 2, 3, 4, 6]),
      ...rowsFor('a-captain', [5]),
      ...rowsFor('a-captain', range(7, 18)),
    ]);
    const { result } = renderHook(() =>
      useMyScoredHoles({
        ...base,
        gameMode: 'patsome',
        myTeamScoreOwnerId: 'a-captain',
        myScoredHoles: [],
      }),
    );
    expect(result.current.has(5)).toBe(false);
    expect(result.current.size).toBe(17);
  });
});

describe('useSiblingScoredHoles', () => {
  it('is null when the round has no split-day sibling', () => {
    liveQuery.mockReturnValue([]);
    const { result } = renderHook(() =>
      useSiblingScoredHoles({ holeStripSibling: null, myUserId: 'u1' }),
    );
    expect(result.current).toBeNull();
  });
});

describe('usePendingSyncCount', () => {
  it('counts only this round’s queue items (#1370)', () => {
    // The Dexie queue is global. Before #1370 a stroke left over from another
    // round lit this round's «waiting for network» line.
    const item = (scoreId: string) => ({
      id: scoreId,
      scoreId,
      attemptCount: 1,
      lastError: null,
      createdAt: '2026-08-14T10:00:00.000Z',
      abandonedAt: null,
    });
    liveQuery.mockReturnValue([item('g2:u1:5'), item('g1:u1:3')]);
    const { result } = renderHook(() => usePendingSyncCount('g1'));
    expect(result.current).toBe(1);
  });
});
