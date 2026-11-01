// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createAdminClientMock,
  type QueryOp,
  type QueryResponse,
} from '@/lib/supabase/testing/adminClientMock';

/**
 * Type A (#2752): rutas port og svar. `findSegmentSibling` er ekte, så bare
 * Supabase er stubbet: det som må bevises, er at bare en spiller i spillet får
 * svar, og at søskenet er det samme som nettets hullside finner.
 */

const FRONT9 = '00000000-0000-4000-8000-000000000f09';
const BACK9 = '00000000-0000-4000-8000-000000000b09';
const CUP = '00000000-0000-4000-8000-00000000c0b0';
const PLAYER = 'spilleren';
const STRANGER = 'en-fremmed';
const TEE_OFF = '2026-11-01T09:00:00Z';

const TOKENS: Record<string, string> = { 'token-spiller': PLAYER, 'token-fremmed': STRANGER };

type GameRow = {
  id: string;
  game_mode: string;
  hole_segment: string;
  source_game_id: string | null;
  tournament_id: string | null;
  scheduled_tee_off_at: string;
  created_at: string;
};

const host = (id: string, hole_segment: string, game_mode: string): GameRow => ({
  id,
  game_mode,
  hole_segment,
  source_game_id: null,
  tournament_id: CUP,
  scheduled_tee_off_at: TEE_OFF,
  created_at: TEE_OFF,
});

let db: { games: GameRow[]; players: Record<string, string[]>; throws: boolean };

function respond(op: QueryOp): QueryResponse {
  const value = (column: string) => op.filters.find((f) => f.column === column)?.value;
  if (db.throws) return { data: null, error: { message: 'connection details' } };
  if (op.table === 'games') {
    if (op.single) return { data: db.games.find((g) => g.id === value('id')) ?? null };
    return { data: db.games.filter((g) => g.tournament_id === value('tournament_id')) };
  }
  if (op.table === 'game_players') {
    if (op.single) {
      const ok = db.players[value('game_id') as string]?.includes(value('user_id') as string);
      return { data: ok ? { user_id: value('user_id') } : null };
    }
    const ids = value('game_id') as string[];
    return {
      data: ids
        .filter((id) => db.players[id]?.includes(value('user_id') as string))
        .map((id) => ({ game_id: id, submitted_at: null, team_number: 1 })),
    };
  }
  throw new Error(`uventet spørring: ${op.kind} ${op.table}`);
}

const fake = createAdminClientMock({ tokens: TOKENS, respond: (op) => respond(op) });

vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => fake.client,
}));

import { NextRequest } from 'next/server';
import { GET } from './route';

function call(gameId: string, token?: string) {
  const headers: Record<string, string> = {};
  if (token !== undefined) headers.authorization = `Bearer ${token}`;
  return GET(new NextRequest(`http://localhost/api/games/${gameId}/segment-sibling`, { headers }), {
    params: Promise.resolve({ id: gameId }),
  });
}

beforeEach(() => {
  fake.reset();
  db = {
    games: [host(FRONT9, 'front9', 'greensome_matchplay'), host(BACK9, 'back9', 'best_ball')],
    players: { [FRONT9]: [PLAYER], [BACK9]: [PLAYER] },
    throws: false,
  };
});

describe('porten', () => {
  it('uten token: 401 før noe leses', async () => {
    const res = await call(FRONT9);

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: 'unauthorized' });
    expect(fake.ops).toEqual([]);
  });

  it('et spill kalleren ikke er med i: 404, samme svar som et spill som ikke finnes', async () => {
    const stranger = await call(FRONT9, 'token-fremmed');
    const unknown = await call('00000000-0000-4000-8000-000000000000', 'token-spiller');

    expect(stranger.status).toBe(404);
    expect(unknown.status).toBe(404);
    await expect(stranger.json()).resolves.toEqual({ error: 'not_found' });
    await expect(unknown.json()).resolves.toEqual({ error: 'not_found' });
  });

  it('en id som ikke er en uuid: 404 uten å spørre databasen', async () => {
    const res = await call('ikke-en-uuid', 'token-spiller');

    expect(res.status).toBe(404);
    expect(fake.ops).toEqual([]);
  });

  it('en feilet lesing er 500 med fast kode, aldri databasens tekst', async () => {
    db.throws = true;
    const res = await call(FRONT9, 'token-spiller');

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: 'load_failed' });
  });
});

describe('svaret', () => {
  it('front9 svarer med back9-hosten', async () => {
    const res = await call(FRONT9, 'token-spiller');

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      sibling: {
        gameId: BACK9,
        gameMode: 'best_ball',
        holeSegment: 'back9',
        mySubmittedAt: null,
        myTeamNumber: 1,
      },
    });
  });

  it('back9 svarer med front9-hosten', async () => {
    const res = await call(BACK9, 'token-spiller');

    await expect(res.json()).resolves.toMatchObject({
      sibling: { gameId: FRONT9, holeSegment: 'front9' },
    });
  });

  it('et vanlig spill har ingen søsken, og det koster ingen ekstra spørring', async () => {
    db.games = [{ ...host(FRONT9, 'full', 'stableford'), tournament_id: null }];
    const res = await call(FRONT9, 'token-spiller');

    await expect(res.json()).resolves.toEqual({ sibling: null });
    expect(fake.ops.filter((op) => op.table === 'games')).toHaveLength(1);
  });

  it('en avledet kamp har ingen søsken: den føres ikke selv', async () => {
    db.games = [{ ...host(FRONT9, 'back9', 'singles_matchplay'), source_game_id: BACK9 }];
    const res = await call(FRONT9, 'token-spiller');

    await expect(res.json()).resolves.toEqual({ sibling: null });
  });
});
