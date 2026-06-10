import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  buildSupabaseMock,
  makeRedirectMock,
  RedirectError,
} from '@/tests/serverActionMocks';

/**
 * Unit tests for `approveScorecard`.
 *
 * The action runs `loadAndAuthorize` first, which does:
 *   1. auth.getUser
 *   2. games.select(status).single
 *   3. users.select(is_admin).single
 *   4a. (if not admin) game_players.select(flight_number) for self
 *   4b. (if not admin) game_players.select(flight_number) for target
 *
 * Then on the action itself:
 *   5. game_players.update(...).eq.eq.not.is  (resolves)
 *
 * Tests configure the queue to match this sequence per case.
 */

const redirectMock = makeRedirectMock();
vi.mock('next/navigation', () => ({
  redirect: (url: string) => redirectMock(url),
}));

const revalidatePathMock = vi.fn();
const revalidateTagMock = vi.fn();
vi.mock('next/cache', () => ({
  revalidatePath: (...args: unknown[]) => revalidatePathMock(...args),
  revalidateTag: (...args: unknown[]) => revalidateTagMock(...args),
}));

let supabaseMock: ReturnType<typeof buildSupabaseMock>;
vi.mock('@/lib/supabase/server', () => ({
  getServerClient: async () => supabaseMock,
}));

function lastRedirect(): string | undefined {
  return redirectMock.mock.calls.at(-1)?.[0];
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('approveScorecard', () => {
  it('redirects to /login when no user is authenticated (auth gate)', async () => {
    supabaseMock = buildSupabaseMock([]);
    (supabaseMock.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { user: null },
    });

    const { approveScorecard } = await import('./actions');

    await expect(approveScorecard('game-1', 'player-2')).rejects.toBeInstanceOf(
      RedirectError,
    );
    expect(redirectMock).toHaveBeenCalledWith('/login');
  });

  it('redirects to /approve?error=not_active when game is finished (validation)', async () => {
    supabaseMock = buildSupabaseMock([
      { data: { status: 'finished' }, error: null }, // games lookup
    ]);
    (supabaseMock.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { user: { id: 'user-1' } },
    });

    const { approveScorecard } = await import('./actions');

    await expect(approveScorecard('game-1', 'player-2')).rejects.toBeInstanceOf(
      RedirectError,
    );
    expect(lastRedirect()).toBe('/games/game-1/approve?error=not_active');
  });

  it('happy path (admin): updates approved_at and redirects with ?status=approved', async () => {
    supabaseMock = buildSupabaseMock([
      { data: { status: 'active' }, error: null }, // games
      { data: { is_admin: true }, error: null }, // users.is_admin
      { data: null, error: null }, // game_players.update
    ]);
    (supabaseMock.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { user: { id: 'admin-1' } },
    });

    const { approveScorecard } = await import('./actions');

    await expect(approveScorecard('game-1', 'player-2')).rejects.toBeInstanceOf(
      RedirectError,
    );

    expect(revalidateTagMock).toHaveBeenCalledWith('game-game-1', 'max');
    expect(revalidatePathMock).toHaveBeenCalledWith('/games/game-1');
    expect(revalidatePathMock).toHaveBeenCalledWith('/games/game-1/approve');
    expect(lastRedirect()).toBe('/games/game-1/approve?status=approved');
  });

  it('edge case (authorization): non-admin in a different flight redirects to /', async () => {
    // Defence-in-depth: even though RLS catches this server-side, the action
    // also short-circuits before issuing the UPDATE so a cross-flight click
    // doesn't bubble a DB error back to the user.
    supabaseMock = buildSupabaseMock([
      { data: { status: 'active' }, error: null }, // games
      { data: { is_admin: false }, error: null }, // users.is_admin (not admin)
      { data: { flight_number: 1 }, error: null }, // me: flight 1
      { data: { flight_number: 2 }, error: null }, // target: flight 2
      // No UPDATE queued — we expect the action to short-circuit before it.
    ]);
    (supabaseMock.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { user: { id: 'user-1' } },
    });

    const { approveScorecard } = await import('./actions');

    await expect(approveScorecard('game-1', 'player-2')).rejects.toBeInstanceOf(
      RedirectError,
    );
    expect(lastRedirect()).toBe('/');
    // No revalidation when authz fails.
    expect(revalidateTagMock).not.toHaveBeenCalled();
  });
});
