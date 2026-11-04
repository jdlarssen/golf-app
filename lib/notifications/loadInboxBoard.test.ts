// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAdminClientMock, type QueryOp } from '@/lib/supabase/testing/adminClientMock';
import { buildSupabaseMock } from '@/tests/serverActionMocks';
import type { Database } from '@/lib/database.types';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Type A (#2263, #2759): the read behind the web's page and the app's route.
 * The double answers per table; the rules for what is settled have their own
 * suite (`inboxSections.test.ts`), so this proves the wiring around them.
 */

const VIEWER = 'viewer';
const GAME = '11111111-1111-1111-1111-111111111111';
const GONE = '22222222-2222-2222-2222-222222222222';
const REQ = '33333333-3333-3333-3333-333333333333';

let rows: { unread: object[]; read: object[] };
let notificationsError: { message: string } | null;
let adminGames: object[];
let adminGamesError: { message: string } | null;
let requests: object[];
let ownPlayers: object[];

const admin = createAdminClientMock({
  respond: (op: QueryOp) => {
    if (op.table === 'games') return adminGamesError ? { error: adminGamesError } : { data: adminGames };
    if (op.table === 'game_registration_requests') return { data: requests };
    throw new Error(`uventet spørring med admin-klienten: ${op.kind} ${op.table}`);
  },
});
vi.mock('@/lib/supabase/admin', () => ({ getAdminClient: () => admin.client }));

const archiveStale = vi.fn(async (_opts: unknown) => true);
vi.mock('./archive', () => ({
  archiveStaleNotifications: (opts: unknown) => archiveStale(opts),
}));
const markIds = vi.fn(async (_opts: unknown) => true);
vi.mock('./markRead', () => ({
  markNotificationIdsRead: (opts: unknown) => markIds(opts),
}));

import { loadInboxBoard, settleInboxBoard } from './loadInboxBoard';

/** The caller's client, built per read: `byTable` lists are FIFO, unread first. */
let caller: ReturnType<typeof buildSupabaseMock>;
function load() {
  caller = buildSupabaseMock([], {}, {
    byTable: {
      notifications: notificationsError
        ? [{ error: notificationsError }, { error: notificationsError }]
        : [{ data: rows.unread }, { data: rows.read }],
      game_players: [{ data: ownPlayers }],
    },
  });
  return loadInboxBoard(caller as unknown as SupabaseClient<Database>, VIEWER);
}

const AT = new Date(Date.now() - 60_000).toISOString();

beforeEach(() => {
  vi.clearAllMocks();
  admin.ops.length = 0;
  rows = { unread: [], read: [] };
  notificationsError = null;
  adminGames = [];
  adminGamesError = null;
  requests = [];
  ownPlayers = [];
});

describe('loadInboxBoard', () => {
  it('leser varslene som kalleren, for kalleren, uten de arkiverte', async () => {
    await load();
    const calls = caller.__fromCalls.filter((call) => call.table === 'notifications');
    expect(calls.filter((call) => call.method === 'select')).toHaveLength(2);
    expect(calls.filter((call) => call.method === 'eq' && call.args[0] === 'user_id' && call.args[1] === VIEWER)).toHaveLength(2);
    expect(calls.filter((call) => call.method === 'is' && call.args[0] === 'archived_at' && call.args[1] === null)).toHaveLength(2);
    expect(admin.ops.some((op) => op.table === 'notifications')).toBe(false);
  });

  it('et varsel om et slettet spill er ute av lista og merket for arkivering', async () => {
    rows.unread = [
      { id: 'stale', kind: 'registration_request', payload: { game_id: GONE, game_name: 'X', requester_name: 'P' }, read_at: null, created_at: AT },
      { id: 'kept', kind: 'registration_request', payload: { game_id: GAME, game_name: 'Y', requester_name: 'Q' }, read_at: null, created_at: AT },
    ];
    adminGames = [{ id: GAME, status: 'scheduled', scheduled_tee_off_at: '2026-12-01T10:00:00Z', league_round_id: null }];
    const board = await load();
    expect(board.rows.map((r) => r.id)).toEqual(['kept']);
    expect(board.staleIds).toEqual(['stale']);
    expect(board.teeOffByGame[GAME]).toBe('2026-12-01T10:00:00Z');
  });

  it('en sak som er avgjort andre steder, kommer som lest og merket for skriving', async () => {
    rows.unread = [
      { id: 'answered', kind: 'registration_request', payload: { game_id: GAME, game_name: 'Y', requester_name: 'Q', request_id: REQ }, read_at: null, created_at: AT },
    ];
    adminGames = [{ id: GAME, status: 'scheduled', scheduled_tee_off_at: null, league_round_id: null }];
    requests = [{ id: REQ, status: 'approved' }];
    const board = await load();
    expect(board.settledIds).toEqual(['answered']);
    expect(board.rows[0]?.read_at).not.toBeNull();
  });

  it('resultatet og spillets status følger med tavla', async () => {
    const summary = { kind: 'placement', rank: 2, fieldSize: 12, isTeam: false };
    rows.read = [
      { id: 'res', kind: 'game_finished', payload: { game_id: GAME, game_name: 'Y' }, read_at: AT, created_at: AT },
    ];
    adminGames = [{ id: GAME, status: 'finished', scheduled_tee_off_at: null, league_round_id: 'runde' }];
    ownPlayers = [{ game_id: GAME, result_summary: summary, paid_at: null, submitted_at: null }];
    const board = await load();
    expect(board.finishedGameIds).toEqual([GAME]);
    expect(board.leagueFlightGameIds).toEqual([GAME]);
    expect(board.resultByGame[GAME]).toEqual(summary);
  });

  it('en feilet lesing kaster, og blir aldri en tom innboks (#1392)', async () => {
    notificationsError = { message: 'nede' };
    await expect(load()).rejects.toEqual({ message: 'nede' });
  });

  it('et feilet spilloppslag kaster, og merker ingenting som utdatert (#1393)', async () => {
    rows.unread = [
      { id: 'kept', kind: 'registration_request', payload: { game_id: GAME, game_name: 'Y', requester_name: 'Q' }, read_at: null, created_at: AT },
    ];
    adminGamesError = { message: 'nede' };
    await expect(load()).rejects.toEqual({ message: 'nede' });
  });
});

describe('settleInboxBoard', () => {
  it('skriver bare det lesingen fant', async () => {
    await settleInboxBoard(VIEWER, { staleIds: [], settledIds: [] });
    expect(archiveStale).not.toHaveBeenCalled();
    expect(markIds).not.toHaveBeenCalled();

    await settleInboxBoard(VIEWER, { staleIds: ['a'], settledIds: ['b'] });
    expect(archiveStale).toHaveBeenCalledWith({ userId: VIEWER, ids: ['a'] });
    expect(markIds).toHaveBeenCalledWith({ userId: VIEWER, ids: ['b'] });
  });
});
