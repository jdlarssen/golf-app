// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createAdminClientMock, type QueryOp, type QueryResponse } from '@/lib/supabase/testing/adminClientMock';

/**
 * Type A (#2752): tavla til en ferdig kamp gir ikke mer enn nettet. Porten er
 * håndhevelsen: RLS gir en spiller bare egne kamper, og ruta leser med service role.
 */

const CUP = '44444444-4444-4444-8444-444444444444';
const GAME = '55555555-5555-4555-8555-555555555555';
const HOST = '66666666-6666-4666-8666-666666666666';
const ME = '11111111-1111-4111-8111-111111111111';

const SCORES = [{ user_id: 'a', hole_number: 1, strokes: 4 }];
const finishedGame = (over: Record<string, unknown> = {}) => ({
  id: GAME,
  name: 'Singel 1',
  status: 'finished',
  tournament_id: CUP,
  source_game_id: null,
  spectate_token: 'hemmelig-lenke',
  round_report: { text: 'referat' },
  ...over,
});
let game: Record<string, unknown> | null = finishedGame();
const queries: QueryOp[] = [];

function respond(op: QueryOp): QueryResponse {
  queries.push(op);
  if (op.table === 'games') {
    const id = op.filters.find((f) => f.column === 'id')?.value;
    if (id === HOST) return { data: { name: 'Vert' }, error: null };
    const cup = op.filters.find((f) => f.column === 'tournament_id')?.value;
    return { data: game && id === game.id && cup === game.tournament_id ? game : null, error: null };
  }
  if (op.table === 'game_players') {
    return {
      data: [
        {
          user_id: 'a',
          team_number: 1,
          marker_user_id: 'markør',
          rejection_reason: 'feil slag',
          submitted_by_user_id: 'a',
          approved_by_user_id: 'b',
          withdrawn_by_user_id: 'sjef',
          withdrawn_at: null,
        },
      ],
      error: null,
    };
  }
  if (op.table === 'scores') return { data: SCORES, error: null };
  throw new Error(`ruta leser ikke ${op.table}`);
}
const fake = createAdminClientMock({ tokens: { 'token-meg': ME }, respond });
vi.mock('@/lib/supabase/admin', () => ({ getAdminClient: () => fake.client }));
vi.mock('@/lib/api/appAuth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/appAuth')>();
  return { ...actual, callerScopedClient: () => ({}) };
});

const getCupSnapshot = vi.hoisted(() => vi.fn());
const canViewCupPageAs = vi.hoisted(() => vi.fn());
vi.mock('@/lib/cup/getCupSnapshot', () => ({ getCupSnapshot }));
vi.mock('@/lib/cup/cupPageAccess', () => ({ canViewCupPageAs }));

import { NextRequest } from 'next/server';
import { GET } from './route';

function call(token?: string, gameId = GAME) {
  const headers: Record<string, string> = {};
  if (token) headers.authorization = `Bearer ${token}`;
  return GET(new NextRequest(`http://localhost/api/cup/${CUP}/matches/${gameId}/board`, { headers }), {
    params: Promise.resolve({ id: CUP, gameId }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  fake.reset();
  queries.length = 0;
  game = finishedGame();
  getCupSnapshot.mockResolvedValue({ tournament: { group_id: null }, roster: { team1: [], team2: [] } });
  canViewCupPageAs.mockResolvedValue(true);
});

describe('GET /api/cup/[id]/matches/[gameId]/board', () => {
  it('uten token: 401, før noe leses', async () => {
    expect((await call()).status).toBe(401);
    expect(getCupSnapshot).not.toHaveBeenCalled();
  });

  it('en ferdig kamp: rader og slag, til den som får se cupen', async () => {
    const res = await call('token-meg');

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.game).toMatchObject({ id: GAME, status: 'finished' });
    expect(body.scores).toEqual(SCORES);
    expect(body.sourceGameName).toBeNull();
  });

  // Eierens svar: «ikke for kamper som pågår», også for arrangøren.
  it.each(['active', 'scheduled', 'draft'])('en kamp som er %s: 404, og ingen slag leses', async (status) => {
    game = finishedGame({ status });
    const res = await call('token-meg');
    expect(res.status).toBe(404);
    expect(queries.some((q) => q.table === 'scores' || q.table === 'game_players')).toBe(false);
  });

  it('den som ikke får se cupen: 404, og kampen leses ikke', async () => {
    canViewCupPageAs.mockResolvedValue(false);
    expect((await call('token-meg')).status).toBe(404);
    expect(queries).toEqual([]);
  });

  it('en cup som ikke finnes: 404', async () => {
    getCupSnapshot.mockResolvedValue(null);
    expect((await call('token-meg')).status).toBe(404);
  });

  it('en kamp i en annen cup: 404', async () => {
    game = finishedGame({ tournament_id: 'annen' });
    expect((await call('token-meg')).status).toBe(404);
  });

  it('et id som ikke er en uuid: 404 før noe leses', async () => {
    expect((await call('token-meg', 'x')).status).toBe(404);
    expect(getCupSnapshot).not.toHaveBeenCalled();
  });

  it('feltene tavla ikke viser, sendes ikke', async () => {
    const body = await (await call('token-meg')).json();

    expect(body.game.spectate_token).toBeNull();
    expect(body.game.round_report).toBeNull();
    expect(body.players[0]).toMatchObject({
      user_id: 'a',
      marker_user_id: null,
      rejection_reason: null,
      submitted_by_user_id: null,
      approved_by_user_id: null,
      withdrawn_by_user_id: null,
    });
    expect(JSON.stringify(body)).not.toContain('hemmelig-lenke');
    expect(JSON.stringify(body)).not.toContain('feil slag');
  });

  it('en avledet kamp henter slagene fra verten', async () => {
    game = finishedGame({ source_game_id: HOST });

    const body = await (await call('token-meg')).json();

    expect(body.sourceGameName).toBe('Vert');
    const scores = queries.find((q) => q.table === 'scores');
    expect(scores?.filters).toContainEqual({ op: 'eq', column: 'game_id', value: HOST });
    const players = queries.find((q) => q.table === 'game_players');
    expect(players?.filters).toContainEqual({ op: 'eq', column: 'game_id', value: GAME });
  });

  it('en lesefeil er 500, ikke et nei', async () => {
    getCupSnapshot.mockRejectedValue(new Error('boom'));
    expect((await call('token-meg')).status).toBe(500);
  });
});
