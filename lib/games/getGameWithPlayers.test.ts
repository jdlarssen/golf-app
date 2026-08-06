import { describe, it, expect, vi, beforeEach } from 'vitest';

// Pass unstable_cache through — the subject here is the fetch semantics
// (error vs. genuine 0-row absence), not the caching layer itself. The
// distinction matters BECAUSE of the cache: a null returned on a transient
// query error gets stored under the `game-${id}` tag and serves 404s for
// every consumer until revalidate (#1441 e2e post-mortem).
vi.mock('next/cache', () => ({
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
}));

const mocks = vi.hoisted(() => ({ getAdminClient: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: mocks.getAdminClient,
}));

import { getGameWithPlayers } from './getGameWithPlayers';

type QueryRes = { data: unknown; error: unknown };

const GAME_ROW = { id: 'g1', name: 'Testspill', status: 'active' };
const PLAYER_ROWS = [{ user_id: 'u1' }];

/**
 * Minimal chainable mock for the two queries the helper issues:
 * `games.select(...).eq('id', id).maybeSingle()/.single()` and
 * `game_players.select(...).eq('game_id', id).returns()`. Both terminal
 * shapes are provided so the mock stays valid across the `.single()` →
 * `.maybeSingle()` migration.
 */
function makeAdmin(gameRes: QueryRes, playersRes: QueryRes) {
  return {
    from: (table: string) => ({
      select: () => ({
        eq: () =>
          table === 'games'
            ? {
                single: () => Promise.resolve(gameRes),
                maybeSingle: () => Promise.resolve(gameRes),
              }
            : { returns: () => Promise.resolve(playersRes) },
      }),
    }),
  };
}

describe('getGameWithPlayers — error vs. absence', () => {
  beforeEach(() => {
    mocks.getAdminClient.mockReset();
  });

  it('throws on a games-query error instead of returning null', async () => {
    mocks.getAdminClient.mockReturnValue(
      makeAdmin(
        {
          data: null,
          error: { message: 'AbortError: This operation was aborted', code: '' },
        },
        { data: PLAYER_ROWS, error: null },
      ),
    );
    await expect(getGameWithPlayers('g1')).rejects.toMatchObject({
      message: expect.stringContaining('AbortError'),
    });
  });

  it('returns null when the game genuinely does not exist (0 rows, no error)', async () => {
    mocks.getAdminClient.mockReturnValue(
      makeAdmin({ data: null, error: null }, { data: [], error: null }),
    );
    await expect(getGameWithPlayers('g1')).resolves.toBeNull();
  });

  it('throws on a game_players-query error', async () => {
    mocks.getAdminClient.mockReturnValue(
      makeAdmin(
        { data: GAME_ROW, error: null },
        { data: null, error: { message: 'boom', code: '' } },
      ),
    );
    await expect(getGameWithPlayers('g1')).rejects.toMatchObject({
      message: 'boom',
    });
  });

  it('returns game + players on the happy path', async () => {
    mocks.getAdminClient.mockReturnValue(
      makeAdmin(
        { data: GAME_ROW, error: null },
        { data: PLAYER_ROWS, error: null },
      ),
    );
    await expect(getGameWithPlayers('g1')).resolves.toEqual({
      game: GAME_ROW,
      players: PLAYER_ROWS,
    });
  });
});
