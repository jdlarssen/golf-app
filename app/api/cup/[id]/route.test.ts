// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createAdminClientMock, type QueryOp, type QueryResponse } from '@/lib/supabase/testing/adminClientMock';
import { buildSupabaseMock, type QueryResult } from '@/tests/serverActionMocks';
import type { CupSnapshot } from '@/lib/cup/getCupSnapshot';
import noMessages from '@/messages/no.json';

/**
 * Type A (#2752): rutas port for cup-rommet. Snapshotet har sin egen suite og
 * formen `buildAppCupView.test.ts`; her står porten: uten token ingenting, en
 * klubb-cup er 404 for en utenforstående (samme regel som nettsiden,
 * `canViewCupPageAs`, ekte her), og svaret mens cupen pågår inneholder ingen
 * poeng. Når cupen er ferdig, er tallene snapshotets.
 */

const CUP = '44444444-4444-4444-8444-444444444444';
const ME = '11111111-1111-4111-8111-111111111111';
const OUTSIDER = '99999999-9999-4999-8999-999999999999';

let lineupRows: unknown[] = [];
let lineupError: { message: string } | null = null;

function respond(op: QueryOp): QueryResponse {
  if (op.table === 'cup_lineup_sessions') return { data: lineupRows, error: lineupError };
  throw new Error(`ruta leser ikke ${op.table} med admin-klienten`);
}

const fake = createAdminClientMock({ tokens: { 'token-meg': ME, 'token-fremmed': OUTSIDER }, respond });
vi.mock('@/lib/supabase/admin', () => ({ getAdminClient: () => fake.client }));

let caller: ReturnType<typeof buildSupabaseMock>;
vi.mock('@/lib/api/appAuth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/appAuth')>();
  return { ...actual, callerScopedClient: () => caller };
});

let snapshot: CupSnapshot | null = null;
vi.mock('@/lib/cup/getCupSnapshot', () => ({
  getCupSnapshot: async () => snapshot,
}));

import { NextRequest } from 'next/server';
import { GET } from './route';
import { APP_CUP_UNKNOWN_PLAYER } from '@/lib/cup/buildAppCupView';

function cup(status: 'active' | 'finished', groupId: string | null = null): CupSnapshot {
  return {
    tournament: {
      id: CUP,
      name: 'Klubbmesterskapet',
      team_1_name: 'Team Nord',
      team_2_name: 'Team Sør',
      points_to_win: 14.5,
      status,
      winner_team: status === 'finished' ? 1 : null,
      created_by: 'organiser',
      created_at: '2026-11-01T08:00:00Z',
      started_at: '2026-11-01T09:00:00Z',
      finished_at: null,
      group_id: groupId,
      win_points: 1,
      tie_points: 0.5,
    },
    leaderboard: {
      team1Name: 'Team Nord',
      team2Name: 'Team Sør',
      team1Points: 7.5,
      team2Points: 3.5,
      pointsToWin: 14.5,
      winner: status === 'finished' ? 1 : null,
      matches: [
        {
          gameId: 'kamp-1',
          matchLabel: 'Singel 1',
          team1PlayerName: 'Meg',
          team2PlayerName: 'Kari',
          gameMode: 'singles_matchplay',
          status: 'finished',
          result: { winnerSide: 1, formatted: '3&2' },
          team1UserIds: [ME],
          team2UserIds: ['kari'],
          pointsTeam1: 1,
          pointsTeam2: 0,
        },
      ],
      finishedMatches: 1,
      remainingMatches: 0,
      sideAwardPoints: { team1: 0, team2: 0 },
    },
    roster: {
      team1: [{ userId: ME, name: 'Meg', nickname: null }],
      team2: [{ userId: 'kari', name: 'Kari', nickname: null }],
    },
    sideAwards: [],
    performanceInputs: [],
  } as unknown as CupSnapshot;
}

function call(token?: string, id = CUP) {
  const headers: Record<string, string> = {};
  if (token) headers.authorization = `Bearer ${token}`;
  return GET(new NextRequest(`http://localhost/api/cup/${id}`, { headers }), {
    params: Promise.resolve({ id }),
  });
}

function callerAnswers(tables: Record<string, QueryResult>) {
  const byTable = Object.fromEntries(Object.entries(tables).map(([table, row]) => [table, [row]]));
  caller = buildSupabaseMock([], {}, { byTable });
}

beforeEach(() => {
  fake.reset();
  snapshot = cup('active');
  lineupRows = [];
  lineupError = null;
  callerAnswers({});
});

describe('porten', () => {
  it('uten token: 401 før snapshotet leses', async () => {
    const res = await call();

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: 'unauthorized' });
  });

  it('en id som ikke er en uuid, eller en cup som ikke finnes: 404', async () => {
    expect((await call('token-meg', 'ikke-en-uuid')).status).toBe(404);
    snapshot = null;
    expect((await call('token-meg')).status).toBe(404);
  });

  it('en personlig cup er åpen for alle innloggede, som på nettet', async () => {
    expect((await call('token-fremmed')).status).toBe(200);
  });

  it('en klubb-cup er 404 for en utenforstående, med samme svar som en cup som ikke finnes', async () => {
    snapshot = cup('active', 'klubb-1');
    callerAnswers({
      group_members: { data: null, error: null },
      users: { data: { is_admin: false }, error: null },
      tournament_participants: { data: null, error: null },
    });

    const res = await call('token-fremmed');

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: 'not_found' });
  });

  it('en klubb-cup er åpen for klubbens medlemmer, for global admin og for deltakerne', async () => {
    snapshot = cup('active', 'klubb-1');
    callerAnswers({
      group_members: { data: { user_id: OUTSIDER }, error: null },
      users: { data: { is_admin: false }, error: null },
      tournament_participants: { data: null, error: null },
    });
    expect((await call('token-fremmed')).status).toBe(200);

    callerAnswers({
      group_members: { data: null, error: null },
      users: { data: { is_admin: true }, error: null },
      tournament_participants: { data: null, error: null },
    });
    expect((await call('token-fremmed')).status).toBe(200);

    callerAnswers({
      group_members: { data: null, error: null },
      users: { data: { is_admin: false }, error: null },
      tournament_participants: { data: { user_id: OUTSIDER }, error: null },
    });
    expect((await call('token-fremmed')).status).toBe(200);

    // Står i rosteret: ingen oppslag trengs.
    callerAnswers({});
    expect((await call('token-meg')).status).toBe(200);
  });

  it('en lesefeil er 500 med fast kode, aldri 404 og aldri databasens tekst', async () => {
    snapshot = cup('active', 'klubb-1');
    callerAnswers({
      group_members: { data: null, error: { message: 'connection details' } },
      users: { data: null, error: null },
      tournament_participants: { data: null, error: null },
    });

    const res = await call('token-fremmed');

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: 'load_failed' });
  });
});

describe('hva som går ut', () => {
  it('mens cupen pågår inneholder svaret ingen poeng, vinner eller resultat (#1468)', async () => {
    const res = await call('token-meg');
    const text = await res.text();

    expect(res.status).toBe(200);
    for (const secret of ['team1Points', '7.5', 'pointsTeam1', 'points1', 'winner', '3&2']) {
      expect(text).not.toContain(secret);
    }
    expect(JSON.parse(text)).toMatchObject({ status: 'active', results: null, pointsToWin: 14.5 });
  });

  it('når cupen er ferdig, er tallene de samme som i snapshotet', async () => {
    snapshot = cup('finished');

    const body = await (await call('token-meg')).json();

    expect(body.results).toMatchObject({
      winner: snapshot.leaderboard.winner,
      team1Points: snapshot.leaderboard.team1Points,
      team2Points: snapshot.leaderboard.team2Points,
    });
    expect(body.matches[0].outcome).toMatchObject({ points1: 1, points2: 0, formatted: '3&2' });
    expect(body.matches[0].mine).toBe(true);
  });

  it('sier om kapteinene setter opp lagene, og spør bare om økter som ikke er avdekket', async () => {
    lineupRows = [{ id: 'okt-1' }];

    const body = await (await call('token-meg')).json();

    expect(body.lineupPending).toBe(true);
    const read = fake.ops.find((op) => op.table === 'cup_lineup_sessions');
    expect(read?.columns).toBe('id');
    expect(read?.filters).toContainEqual({ op: 'is', column: 'revealed_at', value: null });
  });

  it('reserveordet for en ukjent spiller er nettets', () => {
    expect(APP_CUP_UNKNOWN_PLAYER).toBe(noMessages.cup.manage.unknownPlayer);
  });
});
