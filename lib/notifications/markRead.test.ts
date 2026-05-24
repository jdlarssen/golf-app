import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildSupabaseMock } from '@/tests/serverActionMocks';

let supabaseMock: ReturnType<typeof buildSupabaseMock>;
vi.mock('@/lib/supabase/server', () => ({
  getServerClient: async () => supabaseMock,
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
    supabaseMock = buildSupabaseMock([{ data: null, error: null }]);
    const { markNotificationsRead } = await import('./markRead');

    await markNotificationsRead({ userId: 'u1', notificationId: 'n-uuid' });

    const eqCalls = supabaseMock.__fromCalls.filter((c) => c.method === 'eq');
    expect(eqCalls).toContainEqual(
      expect.objectContaining({ args: ['id', 'n-uuid'] }),
    );
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
