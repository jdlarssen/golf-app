// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createAdminClientMock } from '@/lib/supabase/testing/adminClientMock';
import { buildSupabaseMock, type QueryResult } from '@/tests/serverActionMocks';
import type { LeagueSnapshot } from '@/lib/league/getLigaSnapshot';

/**
 * Type A (#2638): rutas port for appens ligaside. Snapshotet (`getLigaSnapshot`)
 * har sin egen suite og formen (`buildAppLeagueView`) sin; her står porten:
 * uten token ingenting, en klubbliga er 404 for en utenforstående (samme regel
 * som nettsiden, `canViewLeague`, ekte her), og en deltaker får visningen.
 */

const LEAGUE_ID = '44444444-4444-4444-8444-444444444444';
const ME = '11111111-1111-4111-8111-111111111111';
const OUTSIDER = '99999999-9999-4999-8999-999999999999';

const fake = createAdminClientMock({
  tokens: { 'token-meg': ME, 'token-fremmed': OUTSIDER },
  respond: () => {
    throw new Error('ruta leser ikke selv med admin-klienten');
  },
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
      is_simulator: true,
      sim_settings: null,
    },
    rounds: [],
    participants: [{ userId: ME, name: 'Meg', nickname: null, acceptedAt: null, hasPlayed: false }],
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
  callerReads({ group_members: [{ data: null }], users: [{ data: { is_admin: false } }] });
});

describe('GET /api/liga/[id]', () => {
  it('401 without a token, and the league is never read', async () => {
    expect({ ...(await call()), read: getLigaSnapshot.mock.calls.length }).toEqual({
      status: 401,
      body: { error: 'unauthorized' },
      read: 0,
    });
  });

  it('a club league is 404 for someone outside the club, as if it did not exist', async () => {
    expect(await call('token-fremmed')).toEqual({ status: 404, body: { error: 'not_found' } });
  });

  it('a participant gets the league view', async () => {
    const res = await call('token-meg');
    expect({ status: res.status, league: res.body.league.name, me: res.body.me }).toEqual({
      status: 200,
      league: 'Klubbens vinterliga',
      me: { userId: ME, isParticipant: true },
    });
  });

  it('a standalone league is open to every signed-in user', async () => {
    snapshot = clubSnapshot(null);
    expect((await call('token-fremmed')).status).toBe(200);
  });

  it('404 for a league that does not exist, or an id that is no uuid', async () => {
    snapshot = null;
    expect([await call('token-meg'), await call('token-meg', 'liga-1')]).toEqual([
      { status: 404, body: { error: 'not_found' } },
      { status: 404, body: { error: 'not_found' } },
    ]);
  });

  it('a failed load is 500 load_failed', async () => {
    getLigaSnapshot.mockRejectedValueOnce(new Error('column "x" does not exist'));
    expect(await call('token-meg')).toEqual({ status: 500, body: { error: 'load_failed' } });
  });
});
