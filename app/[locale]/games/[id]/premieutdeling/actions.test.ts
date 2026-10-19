import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildSupabaseMock, makeLocaleRedirectMock, RedirectError } from '@/tests/serverActionMocks';

/**
 * `setCeremonyStep` (#2298): the phone's one write. Query order (FIFO):
 *   1. auth.getUser                              (vi.fn)
 *   2. users.select(is_admin, name).single       (loadRole)
 *   3. games.select(created_by).maybeSingle      (non-admins only)
 *   4. games.select(game_mode).maybeSingle       (format check)
 *   5. games.update({ ceremony_step }).eq.eq.select('id')
 */

const redirectMock = makeLocaleRedirectMock();
// lib/admin/auth.ts redirects via next/navigation.
vi.mock('next/navigation', () => ({
  redirect: (url: string) => redirectMock(url),
}));

const revalidateTagMock = vi.fn();
vi.mock('next/cache', () => ({
  revalidateTag: (...args: unknown[]) => revalidateTagMock(...args),
}));
// No cached read holds ceremony_step, so the action expires no tag.

let supabaseMock: ReturnType<typeof buildSupabaseMock>;
vi.mock('@/lib/supabase/server', () => ({
  getServerClient: async () => supabaseMock,
}));

const GAME_ID = 'game-1';
const ADMIN = { data: { is_admin: true, name: 'Jørgen' }, error: null };
const PLAYER = { data: { is_admin: false, name: 'Marte' }, error: null };
const STABLEFORD = { data: { game_mode: 'stableford' }, error: null };

function signedIn(userId: string) {
  (supabaseMock.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
    data: { user: { id: userId } },
  });
}

function gameWrites() {
  return supabaseMock.__fromCalls.filter((c) => c.table === 'games' && c.method === 'update');
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('setCeremonyStep', () => {
  it.each([5, -1, 1.5, Number.NaN])('refuses step %s before any read or write', async (step) => {
    supabaseMock = buildSupabaseMock([]);
    signedIn('admin-1');
    const { setCeremonyStep } = await import('./actions');

    await expect(setCeremonyStep(GAME_ID, step)).resolves.toEqual({ ok: false });
    expect(supabaseMock.__fromCalls).toEqual([]);
  });

  it('the organiser sets an absolute step on a finished game; no cache to expire', async () => {
    supabaseMock = buildSupabaseMock([
      PLAYER,
      { data: { created_by: 'creator-1' }, error: null },
      STABLEFORD,
      { data: [{ id: GAME_ID }], error: null },
    ]);
    signedIn('creator-1');
    const { setCeremonyStep } = await import('./actions');

    await expect(setCeremonyStep(GAME_ID, 2)).resolves.toEqual({ ok: true });

    expect(gameWrites().map((c) => c.args[0])).toEqual([{ ceremony_step: 2 }]);
    const filters = supabaseMock.__fromCalls
      .filter((c) => c.table === 'games' && c.method === 'eq')
      .map((c) => c.args);
    expect(filters).toContainEqual(['status', 'finished']);
    expect(revalidateTagMock).not.toHaveBeenCalled();
  });

  it('null closes the prize-giving', async () => {
    supabaseMock = buildSupabaseMock([ADMIN, STABLEFORD, { data: [{ id: GAME_ID }], error: null }]);
    signedIn('admin-1');
    const { setCeremonyStep } = await import('./actions');

    await expect(setCeremonyStep(GAME_ID, null)).resolves.toEqual({ ok: true });
    expect(gameWrites().map((c) => c.args[0])).toEqual([{ ceremony_step: null }]);
  });

  it('0 rows (the game is not finished) is a failure', async () => {
    supabaseMock = buildSupabaseMock([ADMIN, STABLEFORD, { data: [], error: null }]);
    signedIn('admin-1');
    const { setCeremonyStep } = await import('./actions');

    await expect(setCeremonyStep(GAME_ID, 1)).resolves.toEqual({ ok: false });
    expect(revalidateTagMock).not.toHaveBeenCalled();
  });

  it('a player who is not the organiser goes to / before any write', async () => {
    supabaseMock = buildSupabaseMock([PLAYER, { data: { created_by: 'someone-else' }, error: null }]);
    signedIn('player-1');
    const { setCeremonyStep } = await import('./actions');

    await expect(setCeremonyStep(GAME_ID, 1)).rejects.toBeInstanceOf(RedirectError);
    expect(redirectMock).toHaveBeenCalledWith('/');
    expect(gameWrites()).toEqual([]);
  });

  it.each(['skins', 'singles_matchplay'])('a %s game has no prize-giving: refused, nothing written', async (mode) => {
    supabaseMock = buildSupabaseMock([ADMIN, { data: { game_mode: mode }, error: null }]);
    signedIn('admin-1');
    const { setCeremonyStep } = await import('./actions');

    await expect(setCeremonyStep(GAME_ID, 1)).resolves.toEqual({ ok: false });
    expect(gameWrites()).toEqual([]);
  });

  it('a failed write is a failure, not a throw', async () => {
    supabaseMock = buildSupabaseMock([ADMIN, STABLEFORD, { data: null, error: { message: 'boom' } }]);
    signedIn('admin-1');
    const { setCeremonyStep } = await import('./actions');

    await expect(setCeremonyStep(GAME_ID, 1)).resolves.toEqual({ ok: false });
  });
});
