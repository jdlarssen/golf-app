import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildSupabaseMock, type QueryResult } from '@/tests/serverActionMocks';

/**
 * #2460 «Gjenta hver uke»: the finish tail's spawn. Mocked at the import
 * boundary (service-role client, guest lookup, invitations, cache), so every
 * write shows up in `__fromCalls` instead of a real database.
 */

let adminClientMock: ReturnType<typeof buildSupabaseMock>;
vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => adminClientMock,
}));

const findGuestIdsMock = vi.fn<(ids: string[]) => Promise<Set<string>>>();
vi.mock('@/lib/games/createGuestPlayer', () => ({
  findGuestIds: (ids: string[]) => findGuestIdsMock(ids),
}));

const notifyRosterInvitesMock = vi.fn<(...a: unknown[]) => Promise<unknown>>();
vi.mock('@/lib/games/notifyRosterInvites', () => ({
  notifyRosterInvites: (...args: unknown[]) => notifyRosterInvitesMock(...args),
}));

const expireGameCacheMock = vi.fn<(id: string) => void>();
vi.mock('@/lib/games/expireGameCache', () => ({
  expireGameCache: (id: string) => expireGameCacheMock(id),
}));

let blockedPairIds: Set<string> | Error = new Set();
vi.mock('@/lib/moderation/blockedPairs', () => ({
  getBlockedPairIds: async () => {
    if (blockedPairIds instanceof Error) throw blockedPairIds;
    return blockedPairIds;
  },
}));

import { spawnWeeklyRepeat } from './spawnWeeklyRepeat';

const NOW = '2026-11-21T13:00:00.000Z';

function sourceRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'g-1',
    name: 'Lørdagsrunden',
    status: 'finished',
    repeat_weekly: true,
    created_by: 'org',
    course_id: 'course-1',
    tee_box_id: 'tee-1',
    hcp_allowance_pct: 100,
    require_peer_approval: false,
    score_visibility: 'live',
    game_mode: 'stableford',
    mode_config: { kind: 'stableford', team_size: 1 },
    registration_mode: 'invite_only',
    registration_type: 'solo',
    let_friends_skip_gate: false,
    entry_fee_kr: 0,
    payment_link: null,
    prizes: [],
    side_tournament_enabled: false,
    side_ld_count: 0,
    side_ctp_count: 0,
    side_ld_holes: null,
    side_ctp_holes: null,
    side_disabled_categories: [],
    start_type: 'first_tee',
    group_id: null,
    tournament_id: null,
    tournament_match_label: null,
    league_round_id: null,
    source_game_id: null,
    hole_segment: 'full',
    scheduled_tee_off_at: '2026-11-21T08:00:00.000Z',
    courses: { name: 'Bogstad' },
    ...overrides,
  };
}

const ROSTER = [
  { user_id: 'org', team_number: null, flight_number: 1, tee_gender: 'mens', withdrawn_at: null },
  { user_id: 'u-2', team_number: null, flight_number: 1, tee_gender: 'ladies', withdrawn_at: null },
  {
    user_id: 'u-3',
    team_number: null,
    flight_number: 1,
    tee_gender: 'mens',
    withdrawn_at: '2026-11-20T10:00:00.000Z',
  },
];

function setup(tables: {
  games?: QueryResult[];
  scores?: QueryResult[];
  game_players?: QueryResult[];
}) {
  adminClientMock = buildSupabaseMock([], {}, {
    byTable: {
      games: tables.games ?? [{ data: sourceRow(), error: null }, { data: { id: 'x' }, error: null }],
      scores: tables.scores ?? [{ data: null, error: null, count: 12 }],
      game_players: tables.game_players ?? [{ data: ROSTER, error: null }, { data: null, error: null }],
    },
  });
}

function calls(table: string, method: string) {
  return adminClientMock.__fromCalls.filter((c) => c.table === table && c.method === method);
}

beforeEach(() => {
  vi.clearAllMocks();
  blockedPairIds = new Set();
  findGuestIdsMock.mockResolvedValue(new Set());
  notifyRosterInvitesMock.mockResolvedValue({ ok: true, invited: 1 });
});

describe('spawnWeeklyRepeat', () => {
  it('creates the next round a week later with the active roster and invites it', async () => {
    setup({});

    const result = await spawnWeeklyRepeat('g-1', NOW);

    expect(result.spawned).toBe(true);
    const [gameInsert] = calls('games', 'insert');
    const game = gameInsert.args[0] as Record<string, unknown>;
    expect(game).toMatchObject({
      status: 'scheduled',
      scheduled_tee_off_at: '2026-11-28T08:00:00.000Z',
      repeat_weekly: true,
      repeated_from_game_id: 'g-1',
      created_by: 'org',
    });
    expect(result).toEqual({ spawned: true, gameId: game.id });

    const [rosterInsert] = calls('game_players', 'insert');
    const rows = rosterInsert.args[0] as Array<Record<string, unknown>>;
    expect(rows.map((r) => r.user_id)).toEqual(['org', 'u-2']);
    expect(rows.every((r) => r.game_id === game.id)).toBe(true);

    expect(findGuestIdsMock).toHaveBeenCalledWith(['org', 'u-2']);
    expect(notifyRosterInvitesMock).toHaveBeenCalledWith({ gameId: game.id, inviterUserId: 'org' });
    expect(expireGameCacheMock).toHaveBeenCalledWith(game.id);
  });

  it.each([
    ['the switch is off', { repeat_weekly: false }, 'off'],
    ['the round is not finished', { status: 'active' }, 'not_finished'],
    ['it is a club tournament', { group_id: 'club-1' }, 'not_standalone'],
    ['it has no organiser', { created_by: null }, 'no_organiser'],
    ['it has no tee-off', { scheduled_tee_off_at: null }, 'no_tee_off'],
  ])('does nothing when %s', async (_label, overrides, reason) => {
    setup({ games: [{ data: sourceRow(overrides), error: null }] });

    expect(await spawnWeeklyRepeat('g-1', NOW)).toEqual({ spawned: false, reason });
    expect(calls('games', 'insert')).toEqual([]);
    expect(notifyRosterInvitesMock).not.toHaveBeenCalled();
  });

  it('stops the series when nobody entered a stroke', async () => {
    setup({ scores: [{ data: null, error: null, count: 0 }] });

    expect(await spawnWeeklyRepeat('g-1', NOW)).toEqual({ spawned: false, reason: 'no_scores' });
    expect(calls('games', 'insert')).toEqual([]);
    // Only entered strokes count: a row with strokes null is a cleared hole.
    expect(calls('scores', 'not')[0].args).toEqual(['strokes', 'is', null]);
  });

  it('reads 23505 on the link as «already there», not an error', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    setup({
      games: [
        { data: sourceRow(), error: null },
        { data: null, error: { code: '23505', message: 'duplicate key value' } },
      ],
    });

    expect(await spawnWeeklyRepeat('g-1', NOW)).toEqual({ spawned: false, reason: 'exists' });
    expect(calls('game_players', 'insert')).toEqual([]);
    expect(notifyRosterInvitesMock).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
    error.mockRestore();
  });

  it('deletes the new round again when its roster cannot be inserted', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    setup({
      games: [
        { data: sourceRow(), error: null },
        { data: { id: 'x' }, error: null },
        { data: [{ id: 'x' }], error: null },
      ],
      game_players: [
        { data: ROSTER, error: null },
        { data: null, error: { code: '23503', message: 'fk' } },
      ],
    });

    expect(await spawnWeeklyRepeat('g-1', NOW)).toEqual({
      spawned: false,
      reason: 'insert_failed',
    });
    const game = calls('games', 'insert')[0].args[0] as { id: string };
    expect(calls('games', 'delete')).toHaveLength(1);
    const deleteFilter = adminClientMock.__fromCalls.find(
      (c, i, all) => c.method === 'eq' && all[i - 1]?.method === 'delete',
    );
    expect(deleteFilter?.args).toEqual(['id', game.id]);
    expect(notifyRosterInvitesMock).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalledWith('[spawnWeeklyRepeat] rollback failed', expect.anything());
    error.mockRestore();
  });

  it('logs a rollback that deleted nothing', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    setup({
      games: [
        { data: sourceRow(), error: null },
        { data: { id: 'x' }, error: null },
        { data: [], error: null },
      ],
      game_players: [
        { data: ROSTER, error: null },
        { data: null, error: { code: '23503', message: 'fk' } },
      ],
    });

    await spawnWeeklyRepeat('g-1', NOW);

    expect(error).toHaveBeenCalledWith('[spawnWeeklyRepeat] rollback failed', expect.anything());
    error.mockRestore();
  });

  it('keeps the new round when the invitation fails', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    notifyRosterInvitesMock.mockRejectedValue(new Error('db down'));
    setup({});

    const result = await spawnWeeklyRepeat('g-1', NOW);

    expect(result.spawned).toBe(true);
    expect(calls('games', 'delete')).toEqual([]);
    error.mockRestore();
  });

  it('reports a failed source read without inserting', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    setup({ games: [{ data: null, error: { code: '42703', message: 'column missing' } }] });

    expect(await spawnWeeklyRepeat('g-1', NOW)).toEqual({
      spawned: false,
      reason: 'read_failed',
    });
    expect(calls('games', 'insert')).toEqual([]);
    error.mockRestore();
  });
});

describe('spawnWeeklyRepeat and blocks (#3019)', () => {
  it('leaves out a player who has a block with the organiser', async () => {
    setup({});
    blockedPairIds = new Set(['u-2']);

    const result = await spawnWeeklyRepeat('g-1', NOW);

    expect(result.spawned).toBe(true);
    const rows = calls('game_players', 'insert')[0].args[0] as Array<Record<string, unknown>>;
    expect(rows.map((r) => r.user_id)).toEqual(['org']);
  });

  it('spawns nothing when the blocks cannot be read', async () => {
    setup({});
    blockedPairIds = new Error('nede');
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(await spawnWeeklyRepeat('g-1', NOW)).toEqual({ spawned: false, reason: 'read_failed' });
    expect(calls('games', 'insert')).toEqual([]);
    log.mockRestore();
  });
});
