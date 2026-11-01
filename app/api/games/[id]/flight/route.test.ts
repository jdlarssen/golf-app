// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createAdminClientMock,
  type QueryOp,
  type QueryResponse,
} from '@/lib/supabase/testing/adminClientMock';

/**
 * Type A (#2750): the route's gate and transport.
 *
 * Neither the access check (`lib/api/appAuth.ts`) nor the flight core
 * (`lib/games/joinFlight.ts`) is stubbed, only Supabase and `next/cache`. This
 * write decides who may score for whom (`can_score_for` reads the flight), so
 * what has to be proven is that the layers hold together: a rejected token
 * never reaches the core, and a POST moves the CALLER's row and nobody else's.
 *
 * The grain of the rule (the capacity check, the offered flights, a failed
 * re-count) has its suite in `flightJoinActions.test.ts`. Here each error code
 * only shows that it reaches the wire with the frozen status.
 */

const GAME_ID = '22222222-2222-2222-2222-222222222222';
const PLAYER = '11111111-1111-1111-1111-111111111111';
const OTHER = '99999999-9999-9999-9999-999999999999';
const OTHER_GAME = '88888888-8888-8888-8888-888888888888';

const PLAYER_TOKEN = 'token-spiller';

type Row = {
  withdrawn_at: string | null;
  flight_number: number | null;
  team_number: number | null;
};

let db: {
  status: string;
  gameMode: string;
  teamSize: number;
  /** The rows in `game_players`, keyed by user_id. */
  players: Record<string, Row>;
  /** Someone else takes the seat between our write and our re-count. */
  rivalAfterWrite: boolean;
  /** Proves that a throw from the core becomes a 500, never half a 200. */
  coreThrows: boolean;
};

function row(flight_number: number | null): Row {
  return { withdrawn_at: null, flight_number, team_number: null };
}

function respond(op: QueryOp): QueryResponse {
  const value = (column: string) =>
    op.filters.find((f) => f.op === 'eq' && f.column === column)?.value;

  if (op.table === 'games') {
    if (db.coreThrows) throw new Error('connection reset');
    return {
      data: {
        status: db.status,
        game_mode: db.gameMode,
        mode_config: { team_size: db.teamSize },
      },
    };
  }

  if (op.table === 'game_players') {
    const active = Object.entries(db.players).filter(([, r]) => r.withdrawn_at == null);

    if (op.kind === 'update') {
      const target = db.players[String(value('user_id'))];
      if (!target) return { data: [] };
      const next = op.payload?.flight_number as number | null;
      target.flight_number = next;
      if (db.rivalAfterWrite && next != null) {
        db.rivalAfterWrite = false;
        db.players.rival = row(next);
      }
      return { data: [{ user_id: value('user_id') }] };
    }

    if (op.single) {
      const self = db.players[String(value('user_id'))];
      return { data: self ? { user_id: value('user_id'), ...self } : null };
    }

    const flight = value('flight_number');
    if (flight !== undefined) {
      const excluded = op.filters.find((f) => f.op === 'neq' && f.column === 'user_id')?.value;
      return {
        data: null,
        count: active.filter(([id, r]) => r.flight_number === flight && id !== excluded).length,
      };
    }

    return { data: active.map(([, r]) => ({ flight_number: r.flight_number })) };
  }

  throw new Error(`uventet spørring: ${op.kind} ${op.table}`);
}

const fake = createAdminClientMock({
  tokens: { [PLAYER_TOKEN]: PLAYER },
  respond: (op) => respond(op),
});

vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => fake.client,
}));
const revalidateTagMock = vi.fn();
vi.mock('next/cache', () => ({
  revalidateTag: (...args: unknown[]) => revalidateTagMock(...args),
}));

import { NextRequest } from 'next/server';
import { POST } from './route';

function request({
  token = `Bearer ${PLAYER_TOKEN}`,
  body = { flightNumber: 2 } as unknown,
  raw,
}: { token?: string | null; body?: unknown; raw?: string } = {}) {
  const headers: Record<string, string> = {};
  if (token !== null) headers.authorization = token;
  return new NextRequest(`http://localhost/api/games/${GAME_ID}/flight`, {
    method: 'POST',
    headers,
    body: raw ?? JSON.stringify(body),
  });
}

/** The route context Next gives the handler: `params` is a Promise in Next 16. */
const ctx = (id = GAME_ID) => ({ params: Promise.resolve({ id }) });

function expectCoreNeverRan() {
  expect(fake.ops).toEqual([]);
}

function writes() {
  return fake.ops.filter((op) => op.kind === 'update');
}

beforeEach(() => {
  vi.clearAllMocks();
  fake.reset();
  db = {
    status: 'scheduled',
    gameMode: 'stableford',
    teamSize: 1,
    players: {
      [PLAYER]: row(1),
      [OTHER]: row(1),
      a: row(1),
      b: row(2),
      c: row(2),
      d: row(null),
    },
    rivalAfterWrite: false,
    coreThrows: false,
  };
});

describe('the gate', () => {
  it('no Authorization header: 401 before anything is read', async () => {
    const res = await POST(request({ token: null }), ctx());

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: 'unauthorized' });
    // No GoTrue round trip either: the header is refused locally.
    expect(fake.getUserCalls).toEqual([]);
    expectCoreNeverRan();
  });

  it('a token GoTrue refuses: 401, nothing runs', async () => {
    const res = await POST(request({ token: 'Bearer utgatt-token' }), ctx());

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: 'unauthorized' });
    expect(fake.getUserCalls).toEqual(['utgatt-token']);
    expectCoreNeverRan();
  });

  it('no token and a broken body: 401, not 400, so the shape says nothing to a stranger', async () => {
    const res = await POST(request({ token: null, raw: 'not json' }), ctx());

    expect(res.status).toBe(401);
  });

  it.each([
    ['empty object', {}],
    ['zero', { flightNumber: 0 }],
    ['negative', { flightNumber: -1 }],
    ['decimal', { flightNumber: 1.5 }],
    ['a string', { flightNumber: '2' }],
    ['null', { flightNumber: null }],
    ['an array', [2]],
  ])('body with %s: 400 bad_request, the core never runs', async (_label, body) => {
    const res = await POST(request({ body }), ctx());

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: 'bad_request' });
    expectCoreNeverRan();
  });

  it('a body that is not JSON: 400 bad_request', async () => {
    const res = await POST(request({ raw: 'not json' }), ctx());

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: 'bad_request' });
    expectCoreNeverRan();
  });

  it('not in the game: 403 not_member, the same answer an unknown game gets', async () => {
    delete db.players[PLAYER];

    const res = await POST(request(), ctx());

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ error: 'not_member' });
    expect(writes()).toEqual([]);
  });

  it('withdrawn: 403 not_member', async () => {
    db.players[PLAYER].withdrawn_at = '2026-11-01T10:00:00.000Z';

    const res = await POST(request(), ctx());

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ error: 'not_member' });
    expect(writes()).toEqual([]);
  });

  it('a game id that is not a uuid: 403 not_member, never a Postgres 22P02', async () => {
    const res = await POST(request(), ctx('ikke-et-spill'));

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ error: 'not_member' });
    expectCoreNeverRan();
  });
});

describe('only your own row', () => {
  it('moves the caller: the game from the path, the player from the token', async () => {
    const res = await POST(request({ body: { flightNumber: 2 } }), ctx());

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
    expect(db.players[PLAYER].flight_number).toBe(2);
    expect(db.players[OTHER].flight_number).toBe(1);
    expect(revalidateTagMock).toHaveBeenCalledWith(`game-${GAME_ID}`, { expire: 0 });
  });

  it('a userId and a gameId in the body change nothing', async () => {
    const res = await POST(
      request({ body: { flightNumber: 2, userId: OTHER, gameId: OTHER_GAME } }),
      ctx(),
    );

    expect(res.status).toBe(200);
    expect(db.players[PLAYER].flight_number).toBe(2);
    expect(db.players[OTHER].flight_number).toBe(1);
    // Every read and write of a player row was filtered on the path's game.
    const rowOps = fake.ops.filter((op) => op.table === 'game_players');
    expect(rowOps.length).toBeGreaterThan(0);
    for (const op of rowOps) {
      expect(op.filters).toContainEqual({ op: 'eq', column: 'game_id', value: GAME_ID });
    }
    // The write was filtered on the token's player, never on the body's.
    expect(writes()).toHaveLength(1);
    expect(writes()[0].filters).toContainEqual({ op: 'eq', column: 'user_id', value: PLAYER });
    expect(JSON.stringify(fake.ops)).not.toContain(OTHER);
  });
});

describe('the wire', () => {
  it('game no longer scheduled: 409 game_not_scheduled', async () => {
    db.status = 'active';

    const res = await POST(request(), ctx());

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({ error: 'game_not_scheduled' });
    expect(writes()).toEqual([]);
  });

  it('a full flight: 409 flight_full', async () => {
    db.players = {
      [PLAYER]: row(2),
      a: row(1),
      b: row(1),
      c: row(1),
      d: row(1),
    };

    const res = await POST(request({ body: { flightNumber: 1 } }), ctx());

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({ error: 'flight_full' });
    expect(writes()).toEqual([]);
  });

  it('a player on a team: 409 flight_bound_to_team', async () => {
    db.players[PLAYER].team_number = 1;

    const res = await POST(request(), ctx());

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({ error: 'flight_bound_to_team' });
    expect(writes()).toEqual([]);
  });

  it('a team format, no team yet: 409 flight_bound_to_team', async () => {
    db.gameMode = 'texas_scramble';
    db.teamSize = 4;

    const res = await POST(request(), ctx());

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({ error: 'flight_bound_to_team' });
    expect(writes()).toEqual([]);
  });

  it('a flight the Startlista does not offer: 409 bad_flight', async () => {
    const res = await POST(request({ body: { flightNumber: 40 } }), ctx());

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({ error: 'bad_flight' });
    expect(writes()).toEqual([]);
  });

  it('the race lost after the write: 409 flight_full, and the row stands where it was', async () => {
    db.players = {
      [PLAYER]: row(2),
      a: row(1),
      b: row(1),
      c: row(1),
      d: row(2),
    };
    db.rivalAfterWrite = true;

    const res = await POST(request({ body: { flightNumber: 1 } }), ctx());

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({ error: 'flight_full' });
    expect(db.players[PLAYER].flight_number).toBe(2);
    expect(revalidateTagMock).not.toHaveBeenCalled();
  });

  it('a throw from the core: 500 flight_failed', async () => {
    db.coreThrows = true;

    const res = await POST(request(), ctx());

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: 'flight_failed' });
    expect(writes()).toEqual([]);
  });
});
