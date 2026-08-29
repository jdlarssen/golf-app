import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Security-focused unit tests for apnsActions.ts (#1282), mirroring
 * pushActions.test.ts: user_id must come from the session, and the delete must
 * be scoped by user so one account can never drop another's device row.
 */

type UpsertCall = { table: string; row: Record<string, unknown>; onConflict: string };
const upsertCalls: UpsertCall[] = [];
const deleteEqCalls: Array<[string, unknown]> = [];

function buildClient(userId: string | null) {
  const selectResult = userId
    ? { data: [{ id: 'row-1' }], error: null }
    : { data: null, error: null };

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
        return { select: () => Promise.resolve(selectResult) };
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

vi.mock('@/lib/supabase/server', () => ({ getServerClient: vi.fn() }));

import { getServerClient } from '@/lib/supabase/server';

const mockGetServerClient = vi.mocked(getServerClient);

beforeEach(() => {
  vi.clearAllMocks();
  upsertCalls.length = 0;
  deleteEqCalls.length = 0;
});

const TOKEN = 'b'.repeat(64);

describe('registerApnsToken', () => {
  it('upserts on token with user_id from the session', async () => {
    const SESSION_USER_ID = 'session-user-42';
    // @ts-expect-error — mock returns a partial client
    mockGetServerClient.mockResolvedValue(buildClient(SESSION_USER_ID));

    const { registerApnsToken } = await import('./apnsActions');
    await registerApnsToken(TOKEN, 'Torny/1.0 iOS');

    expect(upsertCalls).toHaveLength(1);
    expect(upsertCalls[0].table).toBe('apns_tokens');
    expect(upsertCalls[0].row.user_id).toBe(SESSION_USER_ID);
    expect(upsertCalls[0].row.token).toBe(TOKEN);
    // onConflict token is what lets a re-registered device update in place
    // instead of piling up rows every time the token rotates.
    expect(upsertCalls[0].onConflict).toBe('token');
  });

  it('truncates a long user agent to the column width', async () => {
    // @ts-expect-error — mock returns a partial client
    mockGetServerClient.mockResolvedValue(buildClient('u1'));

    const { registerApnsToken } = await import('./apnsActions');
    await registerApnsToken(TOKEN, 'x'.repeat(900));

    expect(upsertCalls[0].row.user_agent).toHaveLength(400);
  });

  it('throws not_authenticated and writes nothing without a session', async () => {
    // @ts-expect-error — mock returns a partial client
    mockGetServerClient.mockResolvedValue(buildClient(null));

    const { registerApnsToken } = await import('./apnsActions');
    await expect(registerApnsToken(TOKEN, 'UA')).rejects.toThrow('not_authenticated');
    expect(upsertCalls).toHaveLength(0);
  });

  it('rejects an empty token instead of writing a useless row', async () => {
    // @ts-expect-error — mock returns a partial client
    mockGetServerClient.mockResolvedValue(buildClient('u1'));

    const { registerApnsToken } = await import('./apnsActions');
    await expect(registerApnsToken('', 'UA')).rejects.toThrow('invalid_token');
    expect(upsertCalls).toHaveLength(0);
  });
});

describe('removeApnsToken', () => {
  it('scopes the delete by BOTH token and the session user_id', async () => {
    const SESSION_USER_ID = 'session-user-42';
    // @ts-expect-error — mock returns a partial client
    mockGetServerClient.mockResolvedValue(buildClient(SESSION_USER_ID));

    const { removeApnsToken } = await import('./apnsActions');
    await removeApnsToken(TOKEN);

    expect(deleteEqCalls).toContainEqual(['token', TOKEN]);
    expect(deleteEqCalls).toContainEqual(['user_id', SESSION_USER_ID]);
  });

  it('throws not_authenticated and deletes nothing without a session', async () => {
    // @ts-expect-error — mock returns a partial client
    mockGetServerClient.mockResolvedValue(buildClient(null));

    const { removeApnsToken } = await import('./apnsActions');
    await expect(removeApnsToken(TOKEN)).rejects.toThrow('not_authenticated');
    expect(deleteEqCalls).toHaveLength(0);
  });
});
