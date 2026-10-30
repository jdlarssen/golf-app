import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { buildSupabaseMock, type QueryResult } from '@/tests/serverActionMocks';

/**
 * The league start core (#2638). The web action's behaviour is locked by
 * actions.test.ts (unchanged); here: the simulator rules on top.
 *  - a simulator league starts a flight of one; a regular one refuses it;
 *  - the first start freezes the league default (sim_frozen_default, 0214)
 *    BEFORE the game insert;
 *  - a failed freeze refuses with settings_freeze_failed and inserts nothing;
 *  - a round that already has a game is not frozen again;
 *  - a start that fails after the freeze leaves it in place: an undo could
 *    race a player who started the round meanwhile (the orchestrator's review);
 *  - a failed read of the round or the league is its own refusal, not
 *    «not found» (the app answers 500, not 404);
 *  - the flight game carries the league's handicap share and stroke cap
 *    (#2660), so the freeze at start applies them.
 *  - #2661: a simulator flight needs its marker's approval
 *    (require_peer_approval), a regular one does not.
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
  label: 'Runde 3',
  course_id: 'c1',
  tee_box_id: 'tb1',
  opens_at: '2000-01-01T00:00:00Z',
  closes_at: '2099-01-01T00:00:00Z',
  original_closes_at: '2099-01-01T00:00:00Z',
};
const LEAGUE_DEFAULT = { green_stimp: '10', wind: 'CALM' };

function league(isSimulator: boolean, hcp = { hcp_allowance_pct: 100, hcp_max_strokes: null as number | null }) {
  return {
    ...hcp,
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
function userQueue(
  isSimulator: boolean,
  members = ['u1', 'u2'],
  hcp?: Parameters<typeof league>[1],
): QueryResult[] {
  return [
    { data: ROUND },
    { data: league(isSimulator, hcp) },
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

describe('startLeagueRoundFlightCore — the league handicap share and cap (#2660)', () => {
  it.each<[string, boolean, number, number | null]>([
    ['a simulator league with 75 % and at most 32 strokes', true, 75, 32],
    ['a regular league with 95 % and no cap', false, 95, null],
    ['a league from before #2660 (100 %, no cap)', false, 100, null],
  ])('%s: the flight game carries both', async (_label, isSimulator, pct, cap) => {
    adminMock = buildSupabaseMock(
      isSimulator
        ? [{ data: [] }, { count: 0 }, { data: [{ id: 'r1' }] }, { data: { id: 'g1' } }]
        : [{ data: [] }, { data: { id: 'g1' } }],
    );
    const user = userClient(
      userQueue(isSimulator, ['u1', 'u2'], { hcp_allowance_pct: pct, hcp_max_strokes: cap }),
    );
    const { startLeagueRoundFlightCore } = await import('./startLeagueRoundFlightCore');
    const result = await startLeagueRoundFlightCore(user, 'u1', 'r1', isSimulator ? [] : ['u2']);

    const insert = adminMock.__fromCalls.find((c) => c.table === 'games' && c.method === 'insert');
    const leagueSelect = user.__fromCalls.find((c) => c.table === 'leagues' && c.method === 'select');
    expect({
      result,
      share: (insert?.args[0] as { hcp_allowance_pct?: number }).hcp_allowance_pct,
      cap: (insert?.args[0] as { hcp_max_strokes?: number | null }).hcp_max_strokes,
      readsBoth: /hcp_allowance_pct.*hcp_max_strokes/.test(String(leagueSelect?.args[0])),
    }).toEqual({ result: { ok: true, gameId: 'g1' }, share: pct, cap, readsBoth: true });
  });
});

describe('startLeagueRoundFlightCore — the flight carries the round (#2688)', () => {
  it('names the flight game after the league and the round', async () => {
    adminMock = buildSupabaseMock([{ data: [] }, { data: { id: 'g1' } }]);
    const { startLeagueRoundFlightCore } = await import('./startLeagueRoundFlightCore');
    await startLeagueRoundFlightCore(userClient(userQueue(false, ['u1', 'u2'])), 'u1', 'r1', ['u2']);
    const insert = adminMock.__fromCalls.find((c) => c.table === 'games' && c.method === 'insert');
    expect((insert?.args[0] as { name: string }).name).toBe('Vinterliga – Runde 3');
  });
});

describe('startLeagueRoundFlightCore — the marker approves a simulator card (#2661)', () => {
  const inserted = () =>
    adminMock.__fromCalls.find((c) => c.table === 'games' && c.method === 'insert')?.args[0] as
      | { require_peer_approval?: boolean }
      | undefined;

  it('a simulator flight is created with peer approval on', async () => {
    adminMock = buildSupabaseMock([{ data: [] }, { count: 1 }, { data: { id: 'g1' } }]);
    const { startLeagueRoundFlightCore } = await import('./startLeagueRoundFlightCore');
    await startLeagueRoundFlightCore(userClient(userQueue(true)), 'u1', 'r1', []);
    expect(inserted()?.require_peer_approval).toBe(true);
  });

  it('a regular league flight keeps peer approval off', async () => {
    adminMock = buildSupabaseMock([{ data: [] }, { data: { id: 'g3' } }]);
    const { startLeagueRoundFlightCore } = await import('./startLeagueRoundFlightCore');
    await startLeagueRoundFlightCore(userClient(userQueue(false)), 'u1', 'r1', ['u2']);
    expect(inserted()?.require_peer_approval).toBe(false);
  });
});

describe('startLeagueRoundFlightCore — the settings freeze (#2638)', () => {
  it('freezes the league default into the round before the game insert', async () => {
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
      written: { sim_frozen_default: { green_stimp: '10', wind: 'CALM' } },
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

  it('a start that fails after the freeze leaves the freeze in place', async () => {
    startScheduledGame.mockResolvedValue({ ok: false, reason: 'tee_missing_rating' });
    adminMock = buildSupabaseMock([
      { data: [] },
      { count: 0 },
      { data: [{ id: 'r1' }] }, // freeze
      { data: { id: 'g1' } }, // game insert
      // What an undo would read and write: queued so one would show up below.
      { count: 0 },
      { data: [{ id: 'r1' }] },
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
      writes: [{ sim_frozen_default: { green_stimp: '10', wind: 'CALM' } }],
    });
  });
});

describe('startLeagueRoundFlightCore — a failed read is not «not found» (the orchestrator\'s review)', () => {
  it.each([
    ['the round read fails', 'round_read_failed', [{ error: { message: 'boom' } }]],
    ['the round does not exist', 'round_not_found', [{ data: null }]],
    ['the league read fails', 'league_read_failed', [{ data: ROUND }, { error: { message: 'boom' } }]],
    ['the league does not exist', 'league_not_found', [{ data: ROUND }, { data: null }]],
  ] as Array<[string, string, QueryResult[]]>)('%s → %s', async (_label, error, queue) => {
    adminMock = buildSupabaseMock([]);
    const { startLeagueRoundFlightCore } = await import('./startLeagueRoundFlightCore');
    const result = await startLeagueRoundFlightCore(userClient(queue), 'u1', 'r1', []);
    expect({ result, adminCalls: calls() }).toEqual({ result: { ok: false, error }, adminCalls: [] });
  });
});

describe('startLeagueRoundFlightCore — a flight holds at most MAX_FLIGHT_PLAYERS (the orchestrator\'s review)', () => {
  it('refuses five players with flight_too_large, before membership is read or anything is written', async () => {
    adminMock = buildSupabaseMock([]);
    const user = userClient(userQueue(true, ['u1', 'u2', 'u3', 'u4', 'u5']));
    const { startLeagueRoundFlightCore } = await import('./startLeagueRoundFlightCore');
    const result = await startLeagueRoundFlightCore(user, 'u1', 'r1', ['u2', 'u3', 'u4', 'u5']);
    // __fromCalls logs every link of a chain; the tables read are what count.
    expect({ result, tablesRead: [...new Set(user.__fromCalls.map((c) => c.table))], adminCalls: calls() }).toEqual({
      result: { ok: false, error: 'flight_too_large' },
      tablesRead: ['league_rounds', 'leagues'],
      adminCalls: [],
    });
  });

  it('four players start (the bound itself)', async () => {
    adminMock = buildSupabaseMock([{ data: [] }, { count: 0 }, { data: [{ id: 'r1' }] }, { data: { id: 'g4' } }]);
    const user = userClient(userQueue(true, ['u1', 'u2', 'u3', 'u4']));
    const { startLeagueRoundFlightCore } = await import('./startLeagueRoundFlightCore');
    expect(await startLeagueRoundFlightCore(user, 'u1', 'r1', ['u2', 'u3', 'u4'])).toEqual({ ok: true, gameId: 'g4' });
  });
});
