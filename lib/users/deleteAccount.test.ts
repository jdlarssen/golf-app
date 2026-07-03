import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Unit tests for #1012: branch selection in the shared account-deletion
 * helper. The Supabase admin client is the system boundary — mocked with a
 * FIFO queue per query plus spies for the GoTrue admin API and the
 * anonymize_user RPC. The SQL side (scrub + cleanup + guards) is covered by
 * supabase/tests/users_anonymize_test.sql, not here.
 */

type QueryResult = { data?: unknown; error?: unknown; count?: number | null };
type SpyFn = (...args: unknown[]) => Promise<{ data: unknown; error: unknown }>;

const state = {
  queue: [] as QueryResult[],
  rpc: vi.fn<SpyFn>(),
  deleteUser: vi.fn<SpyFn>(),
};

function makeBuilder() {
  const next = () =>
    Promise.resolve(state.queue.shift() ?? { data: null, error: null });
  const proxy: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'neq', 'is', 'not', 'in', 'limit']) {
    proxy[m] = () => proxy;
  }
  proxy.maybeSingle = () => next();
  proxy.then = (
    onFulfilled: (v: QueryResult) => unknown,
    onRejected?: (e: unknown) => unknown,
  ) => next().then(onFulfilled, onRejected);
  return proxy;
}

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => ({
    from: () => makeBuilder(),
    rpc: (...args: unknown[]) => state.rpc(...args),
    auth: { admin: { deleteUser: (...args: unknown[]) => state.deleteUser(...args) } },
  }),
}));

const { deleteOrAnonymizeUser, getDeleteBlockReason } = await import(
  './deleteAccount'
);

const USER_ID = '00000000-0000-4000-a000-000000000001';

beforeEach(() => {
  vi.clearAllMocks();
  state.queue = [];
  state.rpc.mockResolvedValue({ data: null, error: null });
  state.deleteUser.mockResolvedValue({ data: null, error: null });
});

describe('deleteOrAnonymizeUser', () => {
  it('hard-deletes when the user has no game history', async () => {
    state.queue = [
      { data: { deleted_at: null } }, // users lookup
      { count: 0 }, // game_players count
    ];
    const result = await deleteOrAnonymizeUser(USER_ID, '[test]');
    expect(result).toEqual({ ok: true, mode: 'hard' });
    expect(state.deleteUser).toHaveBeenCalledExactlyOnceWith(USER_ID);
    expect(state.rpc).not.toHaveBeenCalled();
  });

  it('falls back to anonymization when hard delete hits a residual FK', async () => {
    state.queue = [{ data: { deleted_at: null } }, { count: 0 }];
    state.deleteUser
      .mockResolvedValueOnce({ data: null, error: { message: 'FK violation' } }) // hard
      .mockResolvedValueOnce({ data: null, error: null }); // soft
    const result = await deleteOrAnonymizeUser(USER_ID, '[test]');
    expect(result).toEqual({ ok: true, mode: 'anonymized' });
    expect(state.rpc).toHaveBeenCalledExactlyOnceWith('anonymize_user', {
      p_user_id: USER_ID,
    });
    expect(state.deleteUser).toHaveBeenNthCalledWith(2, USER_ID, true);
  });

  it('anonymizes directly when the user has game history', async () => {
    state.queue = [{ data: { deleted_at: null } }, { count: 3 }];
    const result = await deleteOrAnonymizeUser(USER_ID, '[test]');
    expect(result).toEqual({ ok: true, mode: 'anonymized' });
    expect(state.rpc).toHaveBeenCalledExactlyOnceWith('anonymize_user', {
      p_user_id: USER_ID,
    });
    // Kun soft delete — aldri et hard-delete-forsøk som ville feilet på FK.
    expect(state.deleteUser).toHaveBeenCalledExactlyOnceWith(USER_ID, true);
  });

  it('retries only the auth soft delete when deleted_at is already set', async () => {
    state.queue = [{ data: { deleted_at: '2026-07-03T10:00:00Z' } }];
    const result = await deleteOrAnonymizeUser(USER_ID, '[test]');
    expect(result).toEqual({ ok: true, mode: 'anonymized' });
    expect(state.rpc).not.toHaveBeenCalled();
    expect(state.deleteUser).toHaveBeenCalledExactlyOnceWith(USER_ID, true);
  });

  it('reports failure when the anonymize RPC errors', async () => {
    state.queue = [{ data: { deleted_at: null } }, { count: 1 }];
    state.rpc.mockResolvedValue({ data: null, error: { message: 'boom' } });
    const result = await deleteOrAnonymizeUser(USER_ID, '[test]');
    expect(result).toEqual({ ok: false, reason: 'failed' });
    expect(state.deleteUser).not.toHaveBeenCalled();
  });
});

describe('getDeleteBlockReason', () => {
  it('blocks admin accounts', async () => {
    state.queue = [{ data: { is_admin: true, deleted_at: null } }];
    expect(await getDeleteBlockReason(USER_ID)).toBe('admin_account');
  });

  it('blocks when the user plays in an active or scheduled game', async () => {
    state.queue = [
      { data: { is_admin: false, deleted_at: null } },
      { data: [{ game_id: 'g1' }] }, // playing
      { data: [] }, // created games
      { data: [] }, // cups
      { data: [] }, // leagues
    ];
    expect(await getDeleteBlockReason(USER_ID)).toBe('active_engagements');
  });

  it('blocks when the user organises an unfinished league', async () => {
    state.queue = [
      { data: { is_admin: false, deleted_at: null } },
      { data: [] },
      { data: [] },
      { data: [] },
      { data: [{ id: 'l1' }] },
    ];
    expect(await getDeleteBlockReason(USER_ID)).toBe('active_engagements');
  });

  it('passes an idle non-admin user (and skips checks when already deleted)', async () => {
    state.queue = [
      { data: { is_admin: false, deleted_at: null } },
      { data: [] },
      { data: [] },
      { data: [] },
      { data: [] },
    ];
    expect(await getDeleteBlockReason(USER_ID)).toBeNull();

    state.queue = [{ data: { is_admin: false, deleted_at: '2026-07-03T10:00:00Z' } }];
    expect(await getDeleteBlockReason(USER_ID)).toBeNull();
  });
});
