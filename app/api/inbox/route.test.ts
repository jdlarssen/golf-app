// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAdminClientMock, type QueryOp } from '@/lib/supabase/testing/adminClientMock';
import { buildSupabaseMock } from '@/tests/serverActionMocks';

/**
 * Type A (#2759): porten og transporten for appens innboks. Reglene og tekstene
 * har sine egne suiter; her er tekstkatalogen ekte, og det som må bevises er
 * at uten token når ingenting basen, at en feil aldri blir en tom innboks, og
 * at beløpet ikke går til appen.
 */

const ME = 'meg-selv';
const TOKEN = 'token-meg';
const GAME = '11111111-1111-1111-1111-111111111111';

const AT = new Date(Date.now() - 60_000).toISOString();
let unread: object[] = [];
let adminGames: object[] = [];
let pendingFriends: object[] = [];
let ownPlayers: object[] = [];
let readError: { message: string } | null = null;

let caller: ReturnType<typeof buildSupabaseMock> | null = null;

const admin = createAdminClientMock({
  tokens: { [TOKEN]: ME },
  respond: (op: QueryOp) => {
    if (op.table === 'games') return { data: adminGames };
    if (op.table === 'friendships') return { data: pendingFriends };
    throw new Error(`uventet spørring: ${op.kind} ${op.table}`);
  },
});
vi.mock('@/lib/supabase/admin', () => ({ getAdminClient: () => admin.client }));

vi.mock('@/lib/api/appAuth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/appAuth')>();
  return {
    ...actual,
    callerScopedClient: () => {
      caller = buildSupabaseMock([], {}, {
        byTable: {
          notifications: readError
            ? [{ error: readError }, { error: readError }]
            : [{ data: unread }, { data: [] }],
          game_players: [{ data: ownPlayers }],
        },
      });
      return caller;
    },
  };
});

const settle = vi.fn(async (_userId: string, _board: unknown) => {});
vi.mock('@/lib/notifications/loadInboxBoard', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/notifications/loadInboxBoard')>();
  return {
    ...actual,
    settleInboxBoard: (userId: string, board: unknown) => settle(userId, board),
  };
});

// next/server sin after() finnes ikke utenfor Next-runtime: kjør callbacken straks.
vi.mock('next/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/server')>();
  return { ...actual, after: (fn: () => unknown) => void fn() };
});

import { NextRequest } from 'next/server';
import { GET } from './route';

function get(token?: string) {
  return GET(
    new NextRequest('https://t.test/api/inbox', {
      headers: token ? { authorization: `Bearer ${token}` } : {},
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  caller = null;
  admin.ops.length = 0;
  unread = [];
  adminGames = [];
  pendingFriends = [];
  ownPlayers = [];
  readError = null;
});

describe('GET /api/inbox', () => {
  it.each([[undefined], ['feil-token']])('token %s gir 401, og ingenting leses', async (token) => {
    const res = await get(token);
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: 'unauthorized' });
    expect(caller).toBeNull();
  });

  it('svarer med tavla, ferdig skrevet på norsk, for tokenets bruker', async () => {
    unread = [
      { id: 'a', kind: 'friend_request', payload: { actor_id: 'anders', actor_name: 'Anders Moe' }, read_at: null, created_at: AT },
    ];
    pendingFriends = [{ requester_id: 'anders' }];
    const res = await get(TOKEN);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.actionCount).toBe(1);
    // #2759: saken venter. Den kan ikke merkes, men tallet på konvolutten teller den.
    expect(body.hasUnread).toBe(false);
    expect(body.unreadCount).toBe(1);
    expect(body.sections.action[0]).toMatchObject({
      key: 'a',
      unread: true,
      unreadIds: [],
      friend: true,
      decidable: false,
      destination: '/profile/venner',
      actionKey: 'reply',
    });
    expect(body.sections.action[0].title).toContain('Anders');
    expect(caller?.__fromCalls).toContainEqual({ table: 'notifications', method: 'eq', args: ['user_id', ME] });
  });

  it('en tom innboks er et gyldig svar', async () => {
    const res = await get(TOKEN);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      actionCount: 0,
      hasUnread: false,
      unreadCount: 0,
      sections: { action: [], today: [], earlier: [] },
    });
    expect(settle).not.toHaveBeenCalled();
  });

  it('en feilet lesing er 500 `load_failed`, aldri en tom innboks (#1392)', async () => {
    readError = { message: 'nede' };
    const res = await get(TOKEN);
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: 'load_failed' });
  });

  it('#2759: en sak som er gjort andre steder, er ute av seksjonen og tallet', async () => {
    unread = [
      { id: 'a', kind: 'friend_request', payload: { actor_id: 'anders', actor_name: 'Anders Moe' }, read_at: null, created_at: AT },
    ];
    const body = await (await get(TOKEN)).json();
    expect(body.actionCount).toBe(0);
    expect(body.unreadCount).toBe(0);
    expect(settle.mock.calls[0]?.[1]).toMatchObject({ settledIds: ['a'] });
  });

  it('purringen sier ikke beløpet til appen', async () => {
    adminGames = [{ id: GAME, status: 'active', scheduled_tee_off_at: null, league_round_id: null }];
    ownPlayers = [{ game_id: GAME, result_summary: null, paid_at: null, submitted_at: null, accepted_at: null, withdrawn_at: null }];
    unread = [
      {
        id: 'p',
        kind: 'payment_reminder',
        payload: { game_id: GAME, game_name: 'Y', entry_fee_kr: 250 },
        read_at: null,
        created_at: AT,
      },
    ];
    const body = await (await get(TOKEN)).json();
    expect(body.sections.action[0].actionKey).toBe('seePayment');
    expect(JSON.stringify(body)).not.toMatch(/250/);
  });

  it('det lesingen fant, skrives etter svaret', async () => {
    unread = [
      {
        id: 'gone',
        kind: 'registration_request',
        payload: { game_id: GAME, game_name: 'Y', requester_name: 'Q' },
        read_at: null,
        created_at: AT,
      },
    ];
    await get(TOKEN);
    expect(settle).toHaveBeenCalledTimes(1);
    expect(settle.mock.calls[0]?.[0]).toBe(ME);
    expect(settle.mock.calls[0]?.[1]).toMatchObject({ staleIds: ['gone'] });
  });
});
