// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createAdminClientMock,
  type QueryOp,
  type QueryResponse,
} from '@/lib/supabase/testing/adminClientMock';
import { buildSupabaseMock, type QueryResult } from '@/tests/serverActionMocks';
import { MAX_FLIGHT_SIZE } from '@/lib/games/flightScope';

/**
 * Type A (#2638): rutas port og transport for «Spill runden» i appen.
 *
 * Adgangssjekken (`lib/api/appAuth.ts`) og kjernen
 * (`startLeagueRoundFlightCore`) kjører ekte. Bare Supabase og
 * `startScheduledGame` (handicap-frysing og status-flipp, med egen suite) er
 * doblet. Kjernens grener har sin egen suite; her står det rutene skal bevise:
 * uten token når ingenting basen, en spiller kan starte alene i en
 * simulatorliga, en vanlig liga avviser det med `need_marker`, og feil-bodyene
 * er faste koder.
 */

const ROUND_ID = '22222222-2222-4222-8222-222222222222';
const ME = '11111111-1111-4111-8111-111111111111';
const GAME_ID = '33333333-3333-4333-8333-333333333333';
const CO_PLAYER = '44444444-4444-4444-8444-444444444444';
const TOKEN = 'token-meg';

let freezeRows: unknown[] = [{ id: ROUND_ID }];
let insertError: { message: string } | null = null;

function respond(op: QueryOp): QueryResponse {
  if (op.table === 'games' && op.kind === 'select' && op.columns === 'id') return { count: 0 };
  if (op.table === 'games' && op.kind === 'select') return { data: [] }; // round locks
  if (op.table === 'league_rounds' && op.kind === 'update') return { data: freezeRows };
  if (op.table === 'games' && op.kind === 'insert') {
    return insertError ? { data: null, error: insertError } : { data: { id: GAME_ID } };
  }
  throw new Error(`uventet spørring: ${op.kind} ${op.table}`);
}

const fake = createAdminClientMock({ tokens: { [TOKEN]: ME }, respond });
vi.mock('@/lib/supabase/admin', () => ({ getAdminClient: () => fake.client }));

/** Klienten med kallerens token: runden, ligaen, deltakerne, rosteren, innsettingen. */
let caller: ReturnType<typeof buildSupabaseMock>;
vi.mock('@/lib/api/appAuth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/appAuth')>();
  return { ...actual, callerScopedClient: () => caller };
});

const startScheduledGame = vi.fn();
vi.mock('@/lib/games/startScheduledGame', () => ({
  startScheduledGame: (...args: unknown[]) => startScheduledGame(...args),
}));

import { NextRequest } from 'next/server';
import { POST } from './route';

function callerQueue(isSimulator: boolean): QueryResult[] {
  return [
    {
      data: {
        id: ROUND_ID,
        league_id: 'l1',
        course_id: 'c1',
        tee_box_id: 'tb1',
        opens_at: '2000-01-01T00:00:00Z',
        closes_at: '2099-01-01T00:00:00Z',
        original_closes_at: '2099-01-01T00:00:00Z',
        sim_settings: null,
      },
    },
    {
      data: {
        id: 'l1',
        name: 'Vinterliga',
        course_id: 'c1',
        tee_box_id: 'tb1',
        status: 'active',
        format: 'stableford',
        is_simulator: isSimulator,
        sim_settings: { green_stimp: '10' },
      },
    },
    { data: [{ user_id: ME }, { user_id: 'other' }] },
    { data: [{ id: ME, gender: 'mens' }] },
    { error: null },
  ];
}

function request({ token, body }: { token?: string; body?: string } = {}) {
  const headers: Record<string, string> = {};
  if (token !== undefined) headers.authorization = `Bearer ${token}`;
  return new NextRequest(`http://localhost/api/liga/rounds/${ROUND_ID}/start`, {
    method: 'POST',
    headers,
    ...(body === undefined ? {} : { body }),
  });
}

const ctx = (roundId = ROUND_ID) => ({ params: Promise.resolve({ roundId }) });

async function call(req: NextRequest, roundId?: string) {
  const res = await POST(req, ctx(roundId));
  return { status: res.status, body: await res.json() };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  fake.reset();
  freezeRows = [{ id: ROUND_ID }];
  insertError = null;
  startScheduledGame.mockResolvedValue({ ok: true, started: true });
  caller = buildSupabaseMock(callerQueue(true));
});

describe('POST /api/liga/rounds/[roundId]/start', () => {
  it('401 without a token, and nothing reaches the database', async () => {
    expect({ ...(await call(request())), ops: fake.ops.length }).toEqual({
      status: 401,
      body: { error: 'unauthorized' },
      ops: 0,
    });
  });

  it('401 with a token GoTrue does not know', async () => {
    expect(await call(request({ token: 'falsk' }))).toEqual({ status: 401, body: { error: 'unauthorized' } });
  });

  it('a simulator league: the player starts the round alone → 200 { gameId }', async () => {
    expect(await call(request({ token: TOKEN, body: JSON.stringify({ coPlayerIds: [] }) }))).toEqual({
      status: 200,
      body: { gameId: GAME_ID },
    });
  });

  it('no body is a start alone too', async () => {
    expect((await call(request({ token: TOKEN }))).status).toBe(200);
  });

  it('a regular league refuses a start alone with 409 need_marker', async () => {
    caller = buildSupabaseMock(callerQueue(false));
    expect(await call(request({ token: TOKEN, body: '{}' }))).toEqual({
      status: 409,
      body: { error: 'need_marker' },
    });
  });

  it('400 for a body that is not JSON, a list that is not uuids, or more ids than a flight', async () => {
    const bad = await call(request({ token: TOKEN, body: 'nei' }));
    const notUuid = await call(request({ token: TOKEN, body: JSON.stringify({ coPlayerIds: ['x'] }) }));
    const tooMany = await call(
      request({
        token: TOKEN,
        body: JSON.stringify({ coPlayerIds: Array.from({ length: MAX_FLIGHT_SIZE + 1 }, () => CO_PLAYER) }),
      }),
    );
    expect([bad, notUuid, tooMany]).toEqual([
      { status: 400, body: { error: 'bad_request' } },
      { status: 400, body: { error: 'bad_request' } },
      { status: 400, body: { error: 'bad_request' } },
    ]);
  });

  it('500 start_failed when the round cannot be read: a read error is not «not found»', async () => {
    caller = buildSupabaseMock([{ error: { message: 'boom' } }]);
    expect(await call(request({ token: TOKEN }))).toEqual({ status: 500, body: { error: 'start_failed' } });
  });

  it('404 not_found for a round that does not exist, or a path that is no uuid', async () => {
    caller = buildSupabaseMock([{ data: null }]);
    const missing = await call(request({ token: TOKEN }));
    const malformed = await call(request({ token: TOKEN }), 'runde-3');
    expect([missing, malformed]).toEqual([
      { status: 404, body: { error: 'not_found' } },
      { status: 404, body: { error: 'not_found' } },
    ]);
  });

  it('a server-side failure is 500 start_failed, never the database message', async () => {
    insertError = { message: 'duplicate key value violates unique constraint "secret_index"' };
    expect(await call(request({ token: TOKEN }))).toEqual({ status: 500, body: { error: 'start_failed' } });
  });

  it('a failed settings freeze is 500 start_failed, before any game is inserted', async () => {
    freezeRows = [];
    const res = await call(request({ token: TOKEN }));
    expect({ ...res, inserted: fake.ops.some((o) => o.table === 'games' && o.kind === 'insert') }).toEqual({
      status: 500,
      body: { error: 'start_failed' },
      inserted: false,
    });
  });
});
