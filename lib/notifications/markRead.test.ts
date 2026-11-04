import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildSupabaseMock } from '@/tests/serverActionMocks';
import type { InboxRow, SettledInputs } from './inboxSections';
import { NOT_WAITING_FILTER, READ_ON_VISIT, type VisitSurface } from './readOnVisit';

let supabaseMock: ReturnType<typeof buildSupabaseMock>;
// #726: markRead bruker admin-client (cookies-fri) fordi flere call-sites
// kjører inni after(), der Next 16 forbyr cookies(). Mock derfor admin, ikke
// server — en revert til getServerClient ville treffe ekte cookies() her og
// feile, så mock-kilden er i seg selv regresjonsvakten.
vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => supabaseMock,
}));

// The visit's settle step reads through this; what it reads is proven in
// loadInboxBoard.test.ts. Here: what the visit does with the answer.
const settledInputsMock = vi.fn();
vi.mock('./loadInboxBoard', () => ({
  readSettledInputs: (...args: unknown[]) => settledInputsMock(...args),
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

  it.each([
    ['«Marker alt lest»', { userId: 'u1' }, { data: null, error: null }],
    ['et trykk', { userId: 'u1', notificationId: 'n-uuid' }, { data: [{ id: 'n-uuid' }], error: null }],
    ['et push-trykk', { userId: 'u1', notificationId: 'n-uuid', zeroRowsOk: true }, { data: [], error: null }],
  ])('#2759: %s tar aldri en sak som venter', async (_label, opts, result) => {
    supabaseMock = buildSupabaseMock([result]);
    const { markNotificationsRead } = await import('./markRead');

    await markNotificationsRead(opts);

    expect(supabaseMock.__fromCalls).toContainEqual(
      expect.objectContaining({ method: 'or', args: [NOT_WAITING_FILTER] }),
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
    supabaseMock = buildSupabaseMock([{ data: [{ id: 'n1' }], error: null }, { data: [], error: null }]);
    const { markReadOnVisit } = await import('./markRead');

    await markReadOnVisit({ userId: 'u1', surface, entityId: key ? ENTITY : undefined });

    // The whole chain, in order: the viewer's unread rows of the surface's
    // kinds that do not wait, scoped by the payload key, with the touched ids
    // read back (so a visit with nothing unread can skip revalidate).
    const chain = [
      ['notifications', 'update', [{ read_at: expect.any(String) }]],
      ['notifications', 'eq', ['user_id', 'u1']],
      ['notifications', 'is', ['read_at', null]],
      ['notifications', 'in', ['kind', [...READ_ON_VISIT[surface].kinds]]],
      ['notifications', 'or', [NOT_WAITING_FILTER]],
      ...(key ? [['notifications', 'eq', [`payload->>${key}`, ENTITY]]] : []),
      ['notifications', 'select', ['id']],
    ];
    expect(supabaseMock.__fromCalls.slice(0, chain.length).map((c) => [c.table, c.method, c.args])).toEqual(chain);
    expect(revalidateTagMock).toHaveBeenCalledWith('notifications-u1', 'max');
  });

  describe('#2759: the rows that wait', () => {
    const ROW: InboxRow = {
      id: 'n-peer',
      kind: 'peer_approval_request',
      payload: { game_id: ENTITY, game_name: 'X', submitter_name: 'Marte', submitter_id: 'marte' },
      read_at: null,
      created_at: '2026-10-01T08:00:00Z',
    };
    const inputs = (over: Partial<SettledInputs>): SettledInputs => ({
      viewerId: 'u1',
      now: 0,
      requestStatus: new Map(),
      cards: [],
      own: new Map([[ENTITY, { paid_at: null, submitted_at: null, accepted_at: 'a', withdrawn_at: null }]]),
      gameStatus: new Map([[ENTITY, 'active']]),
      ownRequestStatus: new Map(),
      pendingFriendIds: new Set(),
      pendingClubIds: new Set(),
      playedRoundIds: new Set(),
      ...over,
    });
    const card = (approved_at: string | null) => ({
      game_id: ENTITY,
      user_id: 'marte',
      submitted_at: 'x',
      approved_at,
      withdrawn_at: null,
      marker_user_id: null,
    });
    const updates = () => supabaseMock.__fromCalls.filter((c) => c.method === 'update');

    it('the hole page renders for every stroke, and sends nothing at all', async () => {
      supabaseMock = buildSupabaseMock([]);
      const { markReadOnVisit } = await import('./markRead');

      await markReadOnVisit({ userId: 'u1', surface: 'gameHole', entityId: ENTITY });

      expect(supabaseMock.__fromCalls).toEqual([]);
    });

    it('a visit does not mark a row that still waits, and looks up only what it needs', async () => {
      supabaseMock = buildSupabaseMock([{ data: [ROW], error: null }]);
      settledInputsMock.mockResolvedValueOnce(inputs({ cards: [card(null)] }));
      const { markReadOnVisit } = await import('./markRead');

      await markReadOnVisit({ userId: 'u1', surface: 'gameApprove', entityId: ENTITY });

      expect(updates()).toEqual([]);
      expect(settledInputsMock).toHaveBeenCalledWith(supabaseMock, 'u1', [ROW], expect.any(Number));
      expect(supabaseMock.__fromCalls).toContainEqual(
        expect.objectContaining({ method: 'eq', args: ['payload->>game_id', ENTITY] }),
      );
    });

    it('a visit after the card is approved marks that row read', async () => {
      supabaseMock = buildSupabaseMock([
        { data: [ROW], error: null },
        { data: [{ id: ROW.id }], error: null },
      ]);
      settledInputsMock.mockResolvedValueOnce(inputs({ cards: [card('y')] }));
      const { markReadOnVisit } = await import('./markRead');

      await markReadOnVisit({ userId: 'u1', surface: 'gameApprove', entityId: ENTITY });

      expect(updates()).toHaveLength(1);
      expect(supabaseMock.__fromCalls).toContainEqual(
        expect.objectContaining({ method: 'in', args: ['id', [ROW.id]] }),
      );
      // The settle write is the one that may touch a row that waits.
      expect(supabaseMock.__fromCalls.filter((c) => c.method === 'or')).toEqual([]);
    });

    it('nothing waits here: one read and no lookups', async () => {
      supabaseMock = buildSupabaseMock([{ data: [], error: null }]);
      const { markReadOnVisit } = await import('./markRead');

      await markReadOnVisit({ userId: 'u1', surface: 'gameApprove', entityId: ENTITY });

      expect(settledInputsMock).not.toHaveBeenCalled();
    });

    it('the friends page has no entity, and checks only the kinds it answers', async () => {
      supabaseMock = buildSupabaseMock([{ data: [], error: null }, { data: [], error: null }]);
      const { markReadOnVisit } = await import('./markRead');

      await markReadOnVisit({ userId: 'u1', surface: 'friends' });

      expect(supabaseMock.__fromCalls).toContainEqual(
        expect.objectContaining({ method: 'in', args: ['kind', ['friend_request']] }),
      );
    });

    it.each(['markReadOnVisit', 'settleOnVisit'] as const)(
      '%s: a failed lookup settles nothing and never throws',
      async (name) => {
        const consoleErr = vi.spyOn(console, 'error').mockImplementation(() => {});
        supabaseMock = buildSupabaseMock([{ data: [ROW], error: null }]);
        settledInputsMock.mockRejectedValueOnce(new Error('nede'));
        const mod = await import('./markRead');

        await expect(mod[name]({ userId: 'u1', surface: 'gameApprove', entityId: ENTITY })).resolves.toBeUndefined();

        expect(updates()).toEqual([]);
        expect(consoleErr).toHaveBeenCalled();
        consoleErr.mockRestore();
      },
    );
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

  it('#2759: a tap on a group leaves a row that waits, and the settle write does not', async () => {
    supabaseMock = buildSupabaseMock([
      { data: HEADS_UP.map((id) => ({ id })), error: null },
      { data: HEADS_UP.map((id) => ({ id })), error: null },
    ]);
    const { markNotificationIdsRead, markSettledRead } = await import('./markRead');

    await markNotificationIdsRead({ userId: 'u1', ids: HEADS_UP });
    expect(supabaseMock.__fromCalls.filter((c) => c.method === 'or')).toEqual([
      expect.objectContaining({ args: [NOT_WAITING_FILTER] }),
    ]);

    await markSettledRead({ userId: 'u1', ids: HEADS_UP });
    expect(supabaseMock.__fromCalls.filter((c) => c.method === 'or')).toHaveLength(1);
  });

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

