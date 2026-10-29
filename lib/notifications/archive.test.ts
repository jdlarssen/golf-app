import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildSupabaseMock } from '@/tests/serverActionMocks';

let supabaseMock: ReturnType<typeof buildSupabaseMock>;
// archive bruker cookies-klienten (RLS via notifications_update_own), i
// motsetning til markRead som må være cookies-fri for after()-kallerne.
vi.mock('@/lib/supabase/server', () => ({
  getServerClient: async () => supabaseMock,
}));
vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => supabaseMock,
}));

const revalidateTagMock = vi.fn();
vi.mock('next/cache', () => ({
  revalidateTag: (...args: unknown[]) => revalidateTagMock(...args),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

/**
 * #1665: de to arkiverings-modusene har ulikt 0-rads-regime. PostgREST melder
 * ikke feil for en UPDATE som traff ingenting (AGENTS.md felle 2), så ett
 * enkelt varsel må telle rader selv — ellers ser en RLS-blokkert arkivering
 * vellykket ut og kortet forsvinner fra lista uten å være arkivert.
 */
describe('archiveNotifications', () => {
  it('ett varsel som treffer 0 rader → false, ingen revalidate', async () => {
    const consoleErr = vi.spyOn(console, 'error').mockImplementation(() => {});
    supabaseMock = buildSupabaseMock([{ data: [], error: null }]);
    const { archiveNotifications } = await import('./archive');

    const ok = await archiveNotifications({ userId: 'u1', notificationId: 'n-1' });

    expect(ok).toBe(false);
    expect(revalidateTagMock).not.toHaveBeenCalled();
    // `.select('id')` er det som gjør radantallet synlig i det hele tatt.
    expect(supabaseMock.__fromCalls).toContainEqual(
      expect.objectContaining({ method: 'select', args: ['id'] }),
    );
    consoleErr.mockRestore();
  });

  it('ett varsel som treffer 1 rad → true + revalidateTag', async () => {
    supabaseMock = buildSupabaseMock([{ data: [{ id: 'n-1' }], error: null }]);
    const { archiveNotifications } = await import('./archive');

    const ok = await archiveNotifications({ userId: 'u1', notificationId: 'n-1' });

    expect(ok).toBe(true);
    expect(revalidateTagMock).toHaveBeenCalledWith('notifications-u1', 'max');
  });

  it('«Tøm leste» som treffer 0 rader → true (ingenting lest er lov)', async () => {
    supabaseMock = buildSupabaseMock([{ data: [], error: null }]);
    const { archiveNotifications } = await import('./archive');

    const ok = await archiveNotifications({ userId: 'u1' });

    expect(ok).toBe(true);
    expect(revalidateTagMock).toHaveBeenCalledWith('notifications-u1', 'max');
  });
});

// #2263 follow-up: stale signup varsler can be many; the ids go in the URL.
describe('archiveStaleNotifications in slices', () => {
  it('250 ids → three updates of at most 100, each scoped to the user', async () => {
    supabaseMock = buildSupabaseMock([
      { data: null, error: null },
      { data: null, error: null },
      { data: null, error: null },
    ]);
    const { archiveStaleNotifications } = await import('./archive');
    const ids = Array.from({ length: 250 }, (_, i) => `n-${i}`);

    expect(await archiveStaleNotifications({ userId: 'u1', ids })).toBe(true);
    const ins = supabaseMock.__fromCalls.filter((c) => c.method === 'in');
    expect(ins.map((c) => (c.args[1] as string[]).length)).toEqual([100, 100, 50]);
    expect(supabaseMock.__fromCalls.filter((c) => c.method === 'eq' && c.args[0] === 'user_id')).toHaveLength(3);
  });
});


// #2481: a deleted game's old notices leave every inbox, read, in one write.
describe('archiveNotificationsForGame', () => {
  it('archives and reads every row naming the game, and refreshes each owner’s inbox once', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    supabaseMock = buildSupabaseMock([
      { data: [{ user_id: 'u1' }, { user_id: 'u2' }, { user_id: 'u1' }], error: null },
    ]);
    const { archiveNotificationsForGame } = await import('./archive');

    expect(await archiveNotificationsForGame('game-1')).toBe(3);
    const calls = supabaseMock.__fromCalls;
    const update = calls.find((c) => c.method === 'update')!.args[0] as Record<string, string>;
    expect(Object.keys(update).sort()).toEqual(['archived_at', 'read_at']);
    expect(calls).toContainEqual(expect.objectContaining({ method: 'eq', args: ['payload->>game_id', 'game-1'] }));
    expect(calls).toContainEqual(expect.objectContaining({ method: 'is', args: ['archived_at', null] }));
    expect(revalidateTagMock.mock.calls).toEqual([
      ['notifications-u1', 'max'],
      ['notifications-u2', 'max'],
    ]);
  });

  it('no notices about the game is fine: 0, nothing to refresh', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    supabaseMock = buildSupabaseMock([{ data: [], error: null }]);
    const { archiveNotificationsForGame } = await import('./archive');

    expect(await archiveNotificationsForGame('game-1')).toBe(0);
    expect(revalidateTagMock).not.toHaveBeenCalled();
  });

  it('a refused write is logged and never thrown', async () => {
    const consoleErr = vi.spyOn(console, 'error').mockImplementation(() => {});
    supabaseMock = buildSupabaseMock([{ data: null, error: { message: 'boom' } }]);
    const { archiveNotificationsForGame } = await import('./archive');

    expect(await archiveNotificationsForGame('game-1')).toBeNull();
    expect(consoleErr).toHaveBeenCalled();
    consoleErr.mockRestore();
  });
});
