import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { buildSupabaseMock, type QueryResult } from '@/tests/serverActionMocks';

/**
 * The league start core (#2638). The web action's behaviour is locked by
 * actions.test.ts (unchanged); here: the simulator rules on top.
 *  - a simulator league starts a flight of one; a regular one refuses it;
 *  - the first start freezes the round's settings BEFORE the game insert;
 *  - a failed freeze refuses with settings_freeze_failed and inserts nothing;
 *  - a round that already has a game is not frozen again;
 *  - a start that fails after the freeze puts the round's settings back.
 */

let adminMock: ReturnType<typeof buildSupabaseMock>;
vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => adminMock,
}));
const startScheduledGame = vi.fn();
vi.mock('@/lib/games/startScheduledGame', () => ({
  startScheduledGame: (...args: unknown[]) => startScheduledGame(...args),
}));

const ROUND = {
  id: 'r1',
  league_id: 'l1',
  course_id: 'c1',
  tee_box_id: 'tb1',
  opens_at: '2000-01-01T00:00:00Z',
  closes_at: '2099-01-01T00:00:00Z',
  original_closes_at: '2099-01-01T00:00:00Z',
  sim_settings: { green_stimp: '12' },
};
const LEAGUE_DEFAULT = { green_stimp: '10', wind: 'CALM' };

function league(isSimulator: boolean) {
  return {
    id: 'l1',
    name: 'Vinterliga',
    course_id: 'c1',
    tee_box_id: 'tb1',
    status: 'active',
    format: 'stableford',
    is_simulator: isSimulator,
    sim_settings: LEAGUE_DEFAULT,
  };
}

/** The player's client, in call order up to the game_players insert. */
function userQueue(isSimulator: boolean, members = ['u1', 'u2']): QueryResult[] {
  return [
    { data: ROUND },
    { data: league(isSimulator) },
    { data: members.map((user_id) => ({ user_id })) },
    { data: [{ id: 'u1', gender: 'mens' }] },
    { error: null }, // game_players insert
  ];
}

function userClient(queue: QueryResult[]) {
  return buildSupabaseMock(queue) as unknown as SupabaseClient<Database> & {
    __fromCalls: Array<{ table: string; method: string; args: unknown[] }>;
  };
}

const calls = () => adminMock.__fromCalls.map((c) => `${c.table}.${c.method}`);

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  startScheduledGame.mockResolvedValue({ ok: true, started: true });
});

describe('startLeagueRoundFlightCore — the marker rule follows the league (#2638)', () => {
  it('a simulator league starts a flight of one', async () => {
    adminMock = buildSupabaseMock([
      { data: [] }, // round locks: nobody has played
      { count: 0 }, // no game for the round yet
      { data: [{ id: 'r1' }] }, // the freeze
      { data: { id: 'g1' } }, // the flight game
    ]);
    const { startLeagueRoundFlightCore } = await import('./startLeagueRoundFlightCore');
    const result = await startLeagueRoundFlightCore(userClient(userQueue(true)), 'u1', 'r1', []);
    expect(result).toEqual({ ok: true, gameId: 'g1' });
  });

  it('a regular league refuses a flight of one with need_marker, before any write', async () => {
    adminMock = buildSupabaseMock([]);
    const { startLeagueRoundFlightCore } = await import('./startLeagueRoundFlightCore');
    const result = await startLeagueRoundFlightCore(userClient(userQueue(false)), 'u1', 'r1', []);
    expect({ result, adminCalls: calls() }).toEqual({
      result: { ok: false, error: 'need_marker' },
      adminCalls: [],
    });
  });
});

describe('startLeagueRoundFlightCore — the settings freeze (#2638)', () => {
  it('writes the effective values into the round before the game insert', async () => {
    adminMock = buildSupabaseMock([
      { data: [] },
      { count: 0 },
      { data: [{ id: 'r1' }] },
      { data: { id: 'g1' } },
    ]);
    const { startLeagueRoundFlightCore } = await import('./startLeagueRoundFlightCore');
    await startLeagueRoundFlightCore(userClient(userQueue(true)), 'u1', 'r1', []);

    const freeze = adminMock.__fromCalls.find((c) => c.table === 'league_rounds' && c.method === 'update');
    expect({
      order: calls().filter((c) => c === 'league_rounds.update' || c === 'games.insert'),
      written: freeze?.args[0],
    }).toEqual({
      order: ['league_rounds.update', 'games.insert'],
      written: { sim_settings: { green_stimp: '12', wind: 'CALM' } },
    });
  });

  it('a freeze that touches no row refuses with settings_freeze_failed and inserts nothing', async () => {
    adminMock = buildSupabaseMock([{ data: [] }, { count: 0 }, { data: [] }]);
    const { startLeagueRoundFlightCore } = await import('./startLeagueRoundFlightCore');
    const result = await startLeagueRoundFlightCore(userClient(userQueue(true)), 'u1', 'r1', []);
    expect({ result, inserted: calls().includes('games.insert') }).toEqual({
      result: { ok: false, error: 'settings_freeze_failed' },
      inserted: false,
    });
  });

  it('a round that already has a game is not frozen again', async () => {
    adminMock = buildSupabaseMock([{ data: [] }, { count: 1 }, { data: { id: 'g2' } }]);
    const { startLeagueRoundFlightCore } = await import('./startLeagueRoundFlightCore');
    const result = await startLeagueRoundFlightCore(userClient(userQueue(true)), 'u1', 'r1', []);
    expect({ result, froze: calls().includes('league_rounds.update') }).toEqual({
      result: { ok: true, gameId: 'g2' },
      froze: false,
    });
  });

  it('a regular league does not freeze anything', async () => {
    adminMock = buildSupabaseMock([{ data: [] }, { data: { id: 'g3' } }]);
    const { startLeagueRoundFlightCore } = await import('./startLeagueRoundFlightCore');
    const result = await startLeagueRoundFlightCore(userClient(userQueue(false)), 'u1', 'r1', ['u2']);
    expect({ result, froze: calls().includes('league_rounds.update') }).toEqual({
      result: { ok: true, gameId: 'g3' },
      froze: false,
    });
  });

  it('a start that fails after the freeze puts the organiser’s settings back', async () => {
    startScheduledGame.mockResolvedValue({ ok: false, reason: 'tee_missing_rating' });
    adminMock = buildSupabaseMock([
      { data: [] },
      { count: 0 },
      { data: [{ id: 'r1' }] }, // freeze
      { data: { id: 'g1' } }, // game insert
      { count: 0 }, // the flight was rolled back: still no game
      { data: [{ id: 'r1' }] }, // unfreeze
    ]);
    const user = userClient([
      ...userQueue(true),
      { error: null }, // game_players rollback
      { data: [{ id: 'g1' }] }, // games rollback
    ]);
    const { startLeagueRoundFlightCore } = await import('./startLeagueRoundFlightCore');
    const result = await startLeagueRoundFlightCore(user, 'u1', 'r1', []);

    const writes = adminMock.__fromCalls
      .filter((c) => c.table === 'league_rounds' && c.method === 'update')
      .map((c) => c.args[0]);
    expect({ result, writes }).toEqual({
      result: { ok: false, error: 'start_tee_missing_rating' },
      writes: [
        { sim_settings: { green_stimp: '12', wind: 'CALM' } },
        { sim_settings: { green_stimp: '12' } },
      ],
    });
  });
});
