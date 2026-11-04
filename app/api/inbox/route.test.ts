// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * Type A (#2759): porten og transporten for `GET /api/inbox`. Reglene og lesingen
 * er bevist i `inboxSections.test.ts`, `inboxWire.test.ts` og
 * `loadInboxBoard.test.ts`.
 */

const callbacks: Array<() => Promise<void>> = [];
vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  after: (fn: () => Promise<void>) => callbacks.push(fn),
}));

const authMock = vi.fn<() => Promise<string | null>>();
const CALLER = { caller: true };
vi.mock('@/lib/api/appAuth', () => ({
  authenticatedUserId: () => authMock(),
  callerScopedClient: () => CALLER,
}));
const loadMock = vi.fn();
vi.mock('@/lib/notifications/loadInboxBoard', () => ({ loadInboxBoard: (...args: unknown[]) => loadMock(...args) }));
const settledMock = vi.fn(async () => true);
vi.mock('@/lib/notifications/markRead', () => ({ markSettledRead: (...args: unknown[]) => settledMock(...(args as [])) }));
const staleMock = vi.fn(async () => true);
vi.mock('@/lib/notifications/archive', () => ({ archiveStaleNotifications: (...args: unknown[]) => staleMock(...(args as [])) }));

import { GET } from './route';

const request = () => new NextRequest('http://local/api/inbox', { headers: { authorization: 'Bearer t' } });
const board = {
  rows: [
    {
      id: 'n1',
      kind: 'friend_request',
      payload: { actor_id: 'a', actor_name: 'Marte Lund' },
      read_at: null,
      created_at: new Date().toISOString(),
    },
  ],
  staleIds: ['s1'],
  settledIds: ['done'],
  teeOffByGame: {},
  resultByGame: {},
  finishedGameIds: [],
  leagueFlightGameIds: [],
  now: Date.now(),
};

beforeEach(() => {
  vi.clearAllMocks();
  callbacks.length = 0;
  authMock.mockResolvedValue('user-1');
  loadMock.mockResolvedValue(board);
});

describe('GET /api/inbox', () => {
  it('without a valid token: 401, and the database is never asked', async () => {
    authMock.mockResolvedValue(null);
    const res = await GET(request());
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'unauthorized' });
    expect(loadMock).not.toHaveBeenCalled();
  });

  it('reads with the caller’s own client, for the id in the token', async () => {
    await GET(request());
    expect(loadMock).toHaveBeenCalledWith(CALLER, 'user-1');
  });

  it('200 with finished rows in Norwegian, from the real catalog', async () => {
    const res = await GET(request());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ actionCount: 1, hasUnread: false, unreadCount: 1 });
    expect(body.sections.action[0]).toMatchObject({ key: 'n1', friend: true, actionKey: 'reply', decidable: false });
    expect(body.sections.action[0].title).toContain('Marte');
  });

  it('a failed read is 500 load_failed: never an empty inbox (#1392), and nothing is written', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    loadMock.mockRejectedValue(new Error('nede'));
    const res = await GET(request());
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'load_failed' });
    expect(callbacks).toEqual([]);
  });

  it('settled rows are marked and stale rows archived after the response', async () => {
    await GET(request());
    expect(settledMock).not.toHaveBeenCalled();
    await Promise.all(callbacks.map((fn) => fn()));
    expect(settledMock).toHaveBeenCalledWith({ userId: 'user-1', ids: ['done'] });
    expect(staleMock).toHaveBeenCalledWith({ userId: 'user-1', ids: ['s1'] });
  });
});
