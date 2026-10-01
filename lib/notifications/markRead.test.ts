import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildSupabaseMock } from '@/tests/serverActionMocks';

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
 * `kind`, `payload->>game_id`, `id`). Tidligere test (#171) testet kun en
 * tautologisk `buildMarkReadQuery`-shape-mapping som ikke fanget at noen
 * byttet `payload->>game_id` til `payload->>gameId` i den ekte impl.
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

  it('kind-filter → .eq("kind", "invite") legges til', async () => {
    supabaseMock = buildSupabaseMock([{ data: null, error: null }]);
    const { markNotificationsRead } = await import('./markRead');

    await markNotificationsRead({ userId: 'u1', kind: 'invite' });

    const eqCalls = supabaseMock.__fromCalls.filter((c) => c.method === 'eq');
    expect(eqCalls).toContainEqual(
      expect.objectContaining({ args: ['user_id', 'u1'] }),
    );
    expect(eqCalls).toContainEqual(
      expect.objectContaining({ args: ['kind', 'invite'] }),
    );
  });

  it('entityId-filter → .eq("payload->>game_id", "game-uuid") (load-bearing kolonne-navn)', async () => {
    // Denne testen er hele poenget med #171: hvis noen bytter
    // `payload->>game_id` til `payload->>gameId` i markRead.ts, skal denne
    // assertion-en feile mekanisk.
    supabaseMock = buildSupabaseMock([{ data: null, error: null }]);
    const { markNotificationsRead } = await import('./markRead');

    await markNotificationsRead({
      userId: 'u1',
      kind: 'game_finished',
      entityId: 'game-uuid',
    });

    const eqCalls = supabaseMock.__fromCalls.filter((c) => c.method === 'eq');
    expect(eqCalls).toContainEqual(
      expect.objectContaining({ args: ['payload->>game_id', 'game-uuid'] }),
    );
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
    expect(revalidateTagMock).not.toHaveBeenCalled();
    // `.select('id')` er det som gjør radantallet synlig i det hele tatt.
    expect(supabaseMock.__fromCalls).toContainEqual(
      expect.objectContaining({ method: 'select', args: ['id'] }),
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

