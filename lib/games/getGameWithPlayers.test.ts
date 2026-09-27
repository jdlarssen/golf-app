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

import { buildSupabaseMock, type QueryResult } from '@/tests/serverActionMocks';
import { getGameWithPlayers } from './getGameWithPlayers';

const GAME_ROW = { id: 'g1', name: 'Testspill', status: 'active' };
const PLAYER_ROWS = [{ user_id: 'u1' }];

/**
 * The helper runs `games…maybeSingle()` and `game_players…returns()` in that
 * order inside Promise.all, so the shared FIFO mock serves them in order.
 * strictSingle (#1693) makes a `.single()` answer a 0-row entry with PGRST116,
 * as PostgREST does — a rollback from `.maybeSingle()` goes red here (#2226).
 */
function makeAdmin(gameRes: QueryResult, playersRes: QueryResult) {
  return buildSupabaseMock([gameRes, playersRes], {}, { strictSingle: true });
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
