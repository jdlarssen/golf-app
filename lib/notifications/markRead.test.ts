import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildSupabaseMock } from '@/tests/serverActionMocks';
import { READ_ON_VISIT, type VisitSurface } from './readOnVisit';

let supabaseMock: ReturnType<typeof buildSupabaseMock>;
// #726: markRead bruker admin-client (cookies-fri) fordi flere call-sites
// kjører inni after(), der Next 16 forbyr cookies(). Mock derfor admin, ikke
// server — en revert til getServerClient ville treffe ekte cookies() her og
// feile, så mock-kilden er i seg selv regresjonsvakten.
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
 * Integrasjons-test for `markNotificationsRead`. Verifiserer at den faktiske
 * Supabase-query-en bruker riktig kolonne-syntaks (`user_id`, `read_at`,
 * `id`). Side-besøkene (kind + payload-nøkkel) testes i `markReadOnVisit`
 * under (#2201).
 */
describe('markNotificationsRead', () => {
  it('userId-only → UPDATE notifications SET read_at WHERE user_id=$1 AND read_at IS NULL', async () => {
    supabaseMock = buildSupabaseMock([{ data: null, error: null }]);
    const { markNotificationsRead } = await import('./markRead');

    await markNotificationsRead({ userId: 'u1' });

    const calls = supabaseMock.__fromCalls;
    expect(calls.find((c) => c.method === 'update' && c.table === 'notifications')).toBeDefined();
    expect(calls).toContainEqual(
      expect.objectContaining({ table: 'notifications', method: 'eq', args: ['user_id', 'u1'] }),
    );
    expect(calls).toContainEqual(
      expect.objectContaining({ method: 'is', args: ['read_at', null] }),
    );
    // Ingen ekstra .eq utover user_id.
    const eqCalls = calls.filter((c) => c.method === 'eq');
    expect(eqCalls).toHaveLength(1);
  });

  it('notificationId-filter → .eq("id", "n-uuid") (per-tap fra innboks)', async () => {
    supabaseMock = buildSupabaseMock([
      { data: [{ id: 'n-uuid' }], error: null },
    ]);
    const { markNotificationsRead } = await import('./markRead');

    const ok = await markNotificationsRead({ userId: 'u1', notificationId: 'n-uuid' });

    expect(ok).toBe(true);
    const eqCalls = supabaseMock.__fromCalls.filter((c) => c.method === 'eq');
    expect(eqCalls).toContainEqual(
      expect.objectContaining({ args: ['id', 'n-uuid'] }),
    );
  });

  it('#1665: enkelt-id som treffer 0 rader → false (RLS/feil id), ingen revalidate', async () => {
    // PostgREST gir error == null for en UPDATE som traff ingenting. Caller
    // pekte på ÉN rad hen nettopp så som ulest, så 0 rader er en feil — ellers
    // ville innboksen/banneret vise falsk suksess.
    const consoleErr = vi.spyOn(console, 'error').mockImplementation(() => {});
    supabaseMock = buildSupabaseMock([{ data: [], error: null }]);
    const { markNotificationsRead } = await import('./markRead');

    const ok = await markNotificationsRead({ userId: 'u1', notificationId: 'n-uuid' });

    expect(ok).toBe(false);
    expect(consoleErr).toHaveBeenCalledWith('[notifications] markRead single-id matched 0 rows', {
      notificationId: 'n-uuid',
    });
    expect(revalidateTagMock).not.toHaveBeenCalled();
    // `.select('id')` er det som gjør radantallet synlig i det hele tatt.
    expect(supabaseMock.__fromCalls).toContainEqual(
      expect.objectContaining({ method: 'select', args: ['id'] }),
    );
    consoleErr.mockRestore();
  });

  it('#2201: push tap (zeroRowsOk) on a row the page already marked → true, silent', async () => {
    // The target page's own after() nearly always marks the row before
    // PwaBoot does, so 0 rows here is the normal case, not an error.
    const consoleErr = vi.spyOn(console, 'error').mockImplementation(() => {});
    supabaseMock = buildSupabaseMock([{ data: [], error: null }]);
    const { markNotificationsRead } = await import('./markRead');

    const ok = await markNotificationsRead({
      userId: 'u1',
      notificationId: 'n-uuid',
      zeroRowsOk: true,
    });

    expect(ok).toBe(true);
    expect(consoleErr).not.toHaveBeenCalled();
    expect(revalidateTagMock).not.toHaveBeenCalled();
    expect(supabaseMock.__fromCalls).toContainEqual(
      expect.objectContaining({ method: 'eq', args: ['id', 'n-uuid'] }),
    );
    consoleErr.mockRestore();
  });

  it('#1665: bulk-kall som treffer 0 rader → true (ingenting ulest er lov)', async () => {
    supabaseMock = buildSupabaseMock([{ data: [], error: null }]);
    const { markNotificationsRead } = await import('./markRead');

    const ok = await markNotificationsRead({ userId: 'u1' });

    expect(ok).toBe(true);
    expect(revalidateTagMock).toHaveBeenCalledWith('notifications-u1', 'max');
  });

  it('happy path → revalidateTag(`notifications-${userId}`, "max")', async () => {
    supabaseMock = buildSupabaseMock([{ data: null, error: null }]);
    const { markNotificationsRead } = await import('./markRead');

    await markNotificationsRead({ userId: 'u1' });

    expect(revalidateTagMock).toHaveBeenCalledWith('notifications-u1', 'max');
  });

  it('error-path → revalidateTag IKKE kalt + console.error logget', async () => {
    const consoleErr = vi.spyOn(console, 'error').mockImplementation(() => {});
    supabaseMock = buildSupabaseMock([
      { data: null, error: { message: 'permission denied' } },
    ]);
    const { markNotificationsRead } = await import('./markRead');

    await markNotificationsRead({ userId: 'u1' });

    expect(revalidateTagMock).not.toHaveBeenCalled();
    expect(consoleErr).toHaveBeenCalledWith(
      '[notifications] markRead failed',
      expect.objectContaining({ message: 'permission denied' }),
    );
    consoleErr.mockRestore();
  });
});

/**
 * #2201: opening a page marks the viewer's unread notifications that link to
 * it. One UPDATE per visit: the surface's kinds, scoped to the page's entity
 * through the payload field the map names (`payload->>game_id` etc. — the
 * column syntax is load-bearing, #171).
 */
describe('markReadOnVisit', () => {
  const ENTITY = 'entity-uuid';

  it.each<{ surface: VisitSurface; key: string | null }>([
    { surface: 'gameHome', key: 'game_id' },
    { surface: 'cup', key: 'tournament_id' },
    { surface: 'club', key: 'group_id' },
    { surface: 'friends', key: null },
  ])('$surface → kinds from the map, payload key $key', async ({ surface, key }) => {
    supabaseMock = buildSupabaseMock([{ data: [{ id: 'n1' }], error: null }]);
    const { markReadOnVisit } = await import('./markRead');

    await markReadOnVisit({ userId: 'u1', surface, entityId: key ? ENTITY : undefined });

    // The whole chain, in order: the viewer's unread rows of the surface's
    // kinds, scoped by the payload key, with the touched ids read back (so a
    // visit with nothing unread can skip revalidate).
    expect(supabaseMock.__fromCalls.map((c) => [c.table, c.method, c.args])).toEqual([
      ['notifications', 'update', [{ read_at: expect.any(String) }]],
      ['notifications', 'eq', ['user_id', 'u1']],
      ['notifications', 'is', ['read_at', null]],
      ['notifications', 'in', ['kind', [...READ_ON_VISIT[surface].kinds]]],
      ...(key ? [['notifications', 'eq', [`payload->>${key}`, ENTITY]]] : []),
      ['notifications', 'select', ['id']],
    ]);
    expect(revalidateTagMock).toHaveBeenCalledWith('notifications-u1', 'max');
  });

  it('a keyed surface without an entity id writes nothing and logs', async () => {
    const consoleErr = vi.spyOn(console, 'error').mockImplementation(() => {});
    supabaseMock = buildSupabaseMock([]);
    const { markReadOnVisit } = await import('./markRead');

    await markReadOnVisit({ userId: 'u1', surface: 'gameHole' });

    expect(supabaseMock.__fromCalls).toHaveLength(0);
    expect(consoleErr).toHaveBeenCalled();
    expect(revalidateTagMock).not.toHaveBeenCalled();
    consoleErr.mockRestore();
  });

  it('nothing unread to touch → no revalidate (the hole page renders often)', async () => {
    supabaseMock = buildSupabaseMock([{ data: [], error: null }]);
    const { markReadOnVisit } = await import('./markRead');

    await markReadOnVisit({ userId: 'u1', surface: 'gameHole', entityId: ENTITY });

    expect(revalidateTagMock).not.toHaveBeenCalled();
  });

  it('a DB error is logged, never thrown, and revalidates nothing', async () => {
    const consoleErr = vi.spyOn(console, 'error').mockImplementation(() => {});
    supabaseMock = buildSupabaseMock([{ data: null, error: { message: 'nede' } }]);
    const { markReadOnVisit } = await import('./markRead');

    await expect(
      markReadOnVisit({ userId: 'u1', surface: 'gameHome', entityId: ENTITY }),
    ).resolves.toBeUndefined();
    expect(consoleErr).toHaveBeenCalled();
    expect(revalidateTagMock).not.toHaveBeenCalled();
    consoleErr.mockRestore();
  });
});

/**
 * #2263: a tap on a group row in the inbox marks exactly the rows in that group.
 * One game can have both kinds of signup varsler — a heads-up without
 * `request_id` (open signup) and a pending request with one. Marking the
 * heads-up group must leave the pending requests unread, so the write goes by
 * id, never by kind + game (which would sweep both).
 */
describe('markNotificationIdsRead', () => {
  const HEADS_UP = ['n-open-1', 'n-open-2'];

  it('marks only the given ids, only unread ones, only the owner’s', async () => {
    supabaseMock = buildSupabaseMock([
      { data: HEADS_UP.map((id) => ({ id })), error: null },
    ]);
    const { markNotificationIdsRead } = await import('./markRead');

    const ok = await markNotificationIdsRead({ userId: 'u1', ids: HEADS_UP });

    expect(ok).toBe(true);
    const calls = supabaseMock.__fromCalls;
    expect(calls).toContainEqual(
      expect.objectContaining({ table: 'notifications', method: 'eq', args: ['user_id', 'u1'] }),
    );
    expect(calls).toContainEqual(expect.objectContaining({ method: 'in', args: ['id', HEADS_UP] }));
    expect(calls).toContainEqual(expect.objectContaining({ method: 'is', args: ['read_at', null] }));
    // No kind/game filter: that would also mark the pending request in the game.
    expect(calls.filter((c) => c.method === 'eq')).toHaveLength(1);
    expect(revalidateTagMock).toHaveBeenCalledWith('notifications-u1', 'max');
  });

  it('0 rows touched → false (the caller saw them unread), no revalidate', async () => {
    const consoleErr = vi.spyOn(console, 'error').mockImplementation(() => {});
    supabaseMock = buildSupabaseMock([{ data: [], error: null }]);
    const { markNotificationIdsRead } = await import('./markRead');

    expect(await markNotificationIdsRead({ userId: 'u1', ids: HEADS_UP })).toBe(false);
    expect(revalidateTagMock).not.toHaveBeenCalled();
    consoleErr.mockRestore();
  });

  it('empty list → true without a write', async () => {
    supabaseMock = buildSupabaseMock([]);
    const { markNotificationIdsRead } = await import('./markRead');

    expect(await markNotificationIdsRead({ userId: 'u1', ids: [] })).toBe(true);
    expect(supabaseMock.__fromCalls).toHaveLength(0);
  });

  it('DB error → false', async () => {
    const consoleErr = vi.spyOn(console, 'error').mockImplementation(() => {});
    supabaseMock = buildSupabaseMock([{ data: null, error: { message: 'nede' } }]);
    const { markNotificationIdsRead } = await import('./markRead');

    expect(await markNotificationIdsRead({ userId: 'u1', ids: HEADS_UP })).toBe(false);
    consoleErr.mockRestore();
  });
});

/**
 * #2263 follow-up: a group can hold more than 100 rows (150 open signups for one
 * club game). The ids travel in the URL, so the write goes in slices of 100 —
 * still one result for the caller, still scoped to the owner's rows.
 */
describe('markNotificationIdsRead in slices', () => {
  const many = (n: number) => Array.from({ length: n }, (_, i) => `n-${i}`);

  it('250 ids → three updates of at most 100, each scoped to the user', async () => {
    supabaseMock = buildSupabaseMock([
      { data: many(100).map((id) => ({ id })), error: null },
      { data: many(100).map((id) => ({ id })), error: null },
      { data: many(50).map((id) => ({ id })), error: null },
    ]);
    const { markNotificationIdsRead } = await import('./markRead');

    expect(await markNotificationIdsRead({ userId: 'u1', ids: many(250) })).toBe(true);
    const calls = supabaseMock.__fromCalls;
    const ins = calls.filter((c) => c.method === 'in');
    expect(ins.map((c) => (c.args[1] as string[]).length)).toEqual([100, 100, 50]);
    expect(calls.filter((c) => c.method === 'eq' && c.args[0] === 'user_id')).toHaveLength(3);
    expect(revalidateTagMock).toHaveBeenCalledTimes(1);
  });

  it('some slices already read elsewhere still count as success', async () => {
    supabaseMock = buildSupabaseMock([
      { data: [], error: null },
      { data: [{ id: 'n-150' }], error: null },
    ]);
    const { markNotificationIdsRead } = await import('./markRead');
    expect(await markNotificationIdsRead({ userId: 'u1', ids: many(150) })).toBe(true);
  });

  it('a failed slice → false', async () => {
    const consoleErr = vi.spyOn(console, 'error').mockImplementation(() => {});
    supabaseMock = buildSupabaseMock([
      { data: [{ id: 'n-0' }], error: null },
      { data: null, error: { message: 'nede' } },
    ]);
    const { markNotificationIdsRead } = await import('./markRead');
    expect(await markNotificationIdsRead({ userId: 'u1', ids: many(150) })).toBe(false);
    consoleErr.mockRestore();
  });
});

