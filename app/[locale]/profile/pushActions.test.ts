import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Security-focused unit tests for pushActions.ts (#24).
 *
 * Key property under test: savePushSubscription must take user_id from the
 * authenticated session, never from client-supplied data. An unauthenticated
 * caller must be rejected with 'not_authenticated'.
 */

// ── Supabase mock ─────────────────────────────────────────────────────────────
// We build a minimal fake client per test so we can inspect what was upserted.

type UpsertCall = { table: string; row: Record<string, unknown>; onConflict: string };
const upsertCalls: UpsertCall[] = [];

// Records every `.eq(column, value)` filter applied to a delete() chain.
const deleteEqCalls: Array<[string, unknown]> = [];

function buildClient(userId: string | null) {
  const selectResult = userId
    ? { data: [{ id: 'row-1' }], error: null }
    : { data: null, error: null };

  const builder = {
    select: () => Promise.resolve(selectResult),
  };

  return {
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: userId ? { id: userId } : null },
        error: null,
      })),
    },
    from: (table: string) => ({
      upsert: (row: Record<string, unknown>, opts: { onConflict: string }) => {
        upsertCalls.push({ table, row, onConflict: opts.onConflict });
        return builder;
      },
      delete: () => ({
        eq: (col: string, val: unknown) => {
          deleteEqCalls.push([col, val]);
          return {
            eq: (col2: string, val2: unknown) => {
              deleteEqCalls.push([col2, val2]);
              return Promise.resolve({ error: null });
            },
          };
        },
      }),
    }),
  };
}

vi.mock('@/lib/supabase/server', () => ({
  getServerClient: vi.fn(),
}));

import { getServerClient } from '@/lib/supabase/server';

const mockGetServerClient = vi.mocked(getServerClient);

beforeEach(() => {
  vi.clearAllMocks();
  upsertCalls.length = 0;
  deleteEqCalls.length = 0;
});

const validSub = {
  endpoint: 'https://push.example.com/sub/abc',
  keys: { p256dh: 'key', auth: 'authval' },
};

describe('savePushSubscription', () => {
  it('upserts with user_id from the session, not from client payload', async () => {
    const SESSION_USER_ID = 'session-user-42';
    // @ts-expect-error — mock returns a partial client
    mockGetServerClient.mockResolvedValue(buildClient(SESSION_USER_ID));

    const { savePushSubscription } = await import('./pushActions');
    await savePushSubscription(validSub, 'Mozilla/5.0 Test');

    expect(upsertCalls).toHaveLength(1);
    const call = upsertCalls[0];
    expect(call.table).toBe('push_subscriptions');
    // Critical: user_id comes from session, not from sub payload
    expect(call.row.user_id).toBe(SESSION_USER_ID);
    expect(call.row.endpoint).toBe(validSub.endpoint);
    expect(call.onConflict).toBe('endpoint');
  });

  it('throws not_authenticated when there is no session', async () => {
    // @ts-expect-error — mock returns a partial client
    mockGetServerClient.mockResolvedValue(buildClient(null));

    const { savePushSubscription } = await import('./pushActions');
    await expect(savePushSubscription(validSub, 'UA')).rejects.toThrow('not_authenticated');
    expect(upsertCalls).toHaveLength(0);
  });
});

describe('removePushSubscription', () => {
  it('scopes the delete by BOTH endpoint and the session user_id', async () => {
    const SESSION_USER_ID = 'session-user-42';
    // @ts-expect-error — mock returns a partial client
    mockGetServerClient.mockResolvedValue(buildClient(SESSION_USER_ID));

    const { removePushSubscription } = await import('./pushActions');
    await removePushSubscription(validSub.endpoint);

    // Both filters must fire so user A can never delete user B's row.
    expect(deleteEqCalls).toContainEqual(['endpoint', validSub.endpoint]);
    expect(deleteEqCalls).toContainEqual(['user_id', SESSION_USER_ID]);
  });

  it('throws not_authenticated and deletes nothing when there is no session', async () => {
    // @ts-expect-error — mock returns a partial client
    mockGetServerClient.mockResolvedValue(buildClient(null));

    const { removePushSubscription } = await import('./pushActions');
    await expect(removePushSubscription(validSub.endpoint)).rejects.toThrow('not_authenticated');
    expect(deleteEqCalls).toHaveLength(0);
  });
});
