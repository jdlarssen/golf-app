// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createAdminClientMock, type QueryOp, type QueryResponse } from '@/lib/supabase/testing/adminClientMock';
import { buildSupabaseMock, type QueryResult } from '@/tests/serverActionMocks';
import type { LeagueSnapshot } from '@/lib/league/getLigaSnapshot';

/**
 * Type A (#2638): rutas port for appens ligaside. Snapshotet (`getLigaSnapshot`)
 * har sin egen suite og formen (`buildAppLeagueView`) sin; her står porten:
 * uten token ingenting, en klubbliga er 404 for en utenforstående (samme regel
 * som nettsiden, `canViewLeague`, ekte her) og snapshotet leses aldri for dem,
 * en deltaker får visningen og blir bekreftet som på nettsiden (#463), og en
 * lesefeil er 500, ikke 404.
 */

const LEAGUE_ID = '44444444-4444-4444-8444-444444444444';
const ME = '11111111-1111-4111-8111-111111111111';
const OUTSIDER = '99999999-9999-4999-8999-999999999999';
const OTHER = '22222222-2222-4222-8222-222222222222';

/** Portens to lesinger med admin-klienten: ligaens klubb og kallerens egen deltakerrad. */
let leagueRow: { group_id: string | null } | null = null;
let leagueError: { message: string } | null = null;
let myRow: { accepted_at: string | null } | null = null;

/** Deltakernes fulle navn og HCP: bare for en kaller som selv er deltaker. */
let detailRows: Array<{ user_id: string; users: { name: string | null; hcp_index: number | null } | null }> = [];
let detailError: { message: string } | null = null;

/** Lesingen av navn og HCP, skilt fra portens deltakerrad på kolonnene. */
const isDetailsRead = (op: QueryOp) => op.table === 'league_players' && (op.columns ?? '').includes('hcp_index');

function respond(op: QueryOp): QueryResponse {
  if (op.table === 'leagues') return { data: leagueRow, error: leagueError };
  if (isDetailsRead(op)) return { data: detailRows, error: detailError };
  if (op.table === 'league_players') return { data: myRow };
  throw new Error(`ruta leser ikke ${op.table} med admin-klienten`);
}

const fake = createAdminClientMock({
  tokens: { 'token-meg': ME, 'token-fremmed': OUTSIDER },
  respond,
});
vi.mock('@/lib/supabase/admin', () => ({ getAdminClient: () => fake.client }));

let caller: ReturnType<typeof buildSupabaseMock>;
vi.mock('@/lib/api/appAuth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/appAuth')>();
  return { ...actual, callerScopedClient: () => caller };
});

let snapshot: LeagueSnapshot | null = null;
const getLigaSnapshot = vi.fn(async () => snapshot);
vi.mock('@/lib/league/getLigaSnapshot', () => ({
  getLigaSnapshot: () => getLigaSnapshot(),
}));

const autoConfirm = vi.fn(async (_opts: { leagueId: string; userId: string }) => {});
vi.mock('@/lib/league/confirmLeagueParticipation', () => ({
  maybeAutoConfirmLeagueParticipation: (opts: { leagueId: string; userId: string }) => autoConfirm(opts),
}));

// next/server sin after() finnes ikke utenfor Next-runtime: kjør callbacken straks.
vi.mock('next/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/server')>();
  return { ...actual, after: (fn: () => unknown) => void fn() };
});

import { NextRequest } from 'next/server';
import { GET } from './route';

function clubSnapshot(groupId: string | null): LeagueSnapshot {
  return {
    league: {
      id: LEAGUE_ID,
      name: 'Klubbens vinterliga',
      season_start: '2026-11-02',
      season_end: '2027-02-07',
      format: 'stroke',
      scoring: 'net',
      standings_model: 'total',
      missed_round_policy: 'penalty',
      penalty_kind: 'worst_plus_one',
      penalty_fixed_over_par: null,
      best_n_count: null,
      course_scope: 'single_course_single_tee',
      course_id: 'c1',
      tee_box_id: 'tb1',
      status: 'active',
      created_by: ME,
      created_at: '2026-11-01T00:00:00Z',
      started_at: '2026-11-01T00:00:00Z',
      finished_at: null,
      group_id: groupId,
      spectate_token: null,
      join_code: null,
      is_simulator: true,
      sim_settings: null,
      hcp_allowance_pct: 75,
      hcp_max_strokes: 32,
    },
    rounds: [],
    participants: [
      { userId: ME, name: 'Meg', nickname: null, acceptedAt: null, hasPlayed: false },
      { userId: OTHER, name: 'Martin Lie', nickname: 'Martin', acceptedAt: null, hasPlayed: true },
    ],
    standings: { net: { rows: [] }, gross: null },
  };
}

function request(token?: string, id = LEAGUE_ID) {
  const headers: Record<string, string> = {};
  if (token) headers.authorization = `Bearer ${token}`;
  return {
    req: new NextRequest(`http://localhost/api/liga/${id}`, { headers }),
    ctx: { params: Promise.resolve({ id }) },
  };
}

async function call(token?: string, id?: string) {
  const { req, ctx } = request(token, id);
  const res = await GET(req, ctx);
  return { status: res.status, body: await res.json() };
}

function callerReads(byTable: Record<string, QueryResult[]>) {
  caller = buildSupabaseMock([], {}, { byTable });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  snapshot = clubSnapshot('club-1');
  leagueRow = { group_id: 'club-1' };
  leagueError = null;
  myRow = null;
  detailRows = [
    { user_id: ME, users: { name: 'Meg Selv', hcp_index: 12.6 } },
    { user_id: OTHER, users: { name: 'Martin Lie', hcp_index: 9.4 } },
  ];
  detailError = null;
  fake.reset();
  callerReads({ group_members: [{ data: null }], users: [{ data: { is_admin: false } }] });
});

/** Kalleren er deltaker i ligaen, bekreftet eller ikke. */
function asParticipant(acceptedAt: string | null = '2026-11-01T00:00:00Z') {
  myRow = { accepted_at: acceptedAt };
}

describe('GET /api/liga/[id]', () => {
  it('401 without a token, and the league is never read', async () => {
    expect({ ...(await call()), read: getLigaSnapshot.mock.calls.length }).toEqual({
      status: 401,
      body: { error: 'unauthorized' },
      read: 0,
    });
  });

  it('a club league is 404 for someone outside the club, and the snapshot is never read', async () => {
    expect({ ...(await call('token-fremmed')), read: getLigaSnapshot.mock.calls.length }).toEqual({
      status: 404,
      body: { error: 'not_found' },
      read: 0,
    });
  });

  it('a participant gets the league view', async () => {
    asParticipant();
    const res = await call('token-meg');
    expect({ status: res.status, league: res.body.league.name, me: res.body.me }).toEqual({
      status: 200,
      league: 'Klubbens vinterliga',
      // #2661: the fixture's league was created by ME.
      me: { userId: ME, isParticipant: true, isOrganizer: true },
    });
  });

  it('the view carries the handicap share and the stroke cap (#2660)', async () => {
    asParticipant();
    const res = await call('token-meg');
    expect({
      hcpAllowancePct: res.body.league.hcpAllowancePct,
      hcpMaxStrokes: res.body.league.hcpMaxStrokes,
    }).toEqual({ hcpAllowancePct: 75, hcpMaxStrokes: 32 });
  });

  it.each([
    ['an unconfirmed participant is confirmed, as on the web (#463)', null, [[{ leagueId: LEAGUE_ID, userId: ME }]]],
    ['a confirmed participant is left alone', '2026-11-01T00:00:00Z', []],
  ])('%s', async (_label, acceptedAt, confirms) => {
    asParticipant(acceptedAt);
    expect({ status: (await call('token-meg')).status, confirms: autoConfirm.mock.calls }).toEqual({
      status: 200,
      confirms,
    });
  });

  it('a standalone league is open to every signed-in user', async () => {
    snapshot = clubSnapshot(null);
    leagueRow = { group_id: null };
    expect({ status: (await call('token-fremmed')).status, confirms: autoConfirm.mock.calls }).toEqual({
      status: 200,
      confirms: [],
    });
  });

  it('404 for a league that does not exist, or an id that is no uuid', async () => {
    leagueRow = null;
    expect([await call('token-meg'), await call('token-meg', 'liga-1')]).toEqual([
      { status: 404, body: { error: 'not_found' } },
      { status: 404, body: { error: 'not_found' } },
    ]);
  });

  it('a participant also gets the full name and HCP of the league participants', async () => {
    asParticipant();
    const res = await call('token-meg');
    const read = fake.ops.find(isDetailsRead);
    expect({
      status: res.status,
      participants: res.body.participants,
      columns: read?.columns,
      filters: read?.filters,
    }).toEqual({
      status: 200,
      participants: [
        { userId: ME, name: 'Meg', fullName: 'Meg Selv', hcpIndex: 12.6 },
        { userId: OTHER, name: 'Martin', fullName: 'Martin Lie', hcpIndex: 9.4 },
      ],
      columns: 'user_id, users!league_players_user_id_fkey(name, hcp_index)',
      filters: [{ op: 'eq', column: 'league_id', value: LEAGUE_ID }],
    });
  });

  it('a club member who is not a participant sees the league, but never the full names or HCP', async () => {
    callerReads({ group_members: [{ data: { user_id: OUTSIDER } }], users: [{ data: { is_admin: false } }] });
    const res = await call('token-fremmed');
    expect({
      status: res.status,
      participants: res.body.participants,
      detailsRead: fake.ops.some(isDetailsRead),
    }).toEqual({
      status: 200,
      participants: [
        { userId: ME, name: 'Meg', fullName: null, hcpIndex: null },
        { userId: OTHER, name: 'Martin', fullName: null, hcpIndex: null },
      ],
      detailsRead: false,
    });
  });

  it('someone outside a club league gets 404, and the full names and HCP are never read', async () => {
    const res = await call('token-fremmed');
    expect({ ...res, detailsRead: fake.ops.some(isDetailsRead) }).toEqual({
      status: 404,
      body: { error: 'not_found' },
      detailsRead: false,
    });
  });

  it('a failed read of the full names and HCP is 500 load_failed', async () => {
    asParticipant();
    detailError = { message: 'boom' };
    expect(await call('token-meg')).toEqual({ status: 500, body: { error: 'load_failed' } });
  });

  it('a failed load is 500 load_failed', async () => {
    asParticipant();
    getLigaSnapshot.mockRejectedValueOnce(new Error('column "x" does not exist'));
    expect(await call('token-meg')).toEqual({ status: 500, body: { error: 'load_failed' } });
  });

  it('a failed gate read is 500 load_failed, not 404', async () => {
    leagueError = { message: 'boom' };
    expect(await call('token-meg')).toEqual({ status: 500, body: { error: 'load_failed' } });
  });

  it('a failed access read in canViewLeague is 500 load_failed, not 404', async () => {
    callerReads({ group_members: [{ data: null, error: { message: 'boom' } }], users: [{ data: { is_admin: false } }] });
    expect(await call('token-fremmed')).toEqual({ status: 500, body: { error: 'load_failed' } });
  });
});
