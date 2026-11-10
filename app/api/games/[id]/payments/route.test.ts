// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createAdminClientMock,
  type QueryOp,
  type QueryResponse,
} from '@/lib/supabase/testing/adminClientMock';

/**
 * Type A (#2749): the gate and transport of the app's three payment routes.
 *
 * Neither the gate (`lib/api/appAuth.ts`, `./gate.ts`) nor the core
 * (`lib/games/payments.ts`) is stubbed; only Supabase, the reminder send, the
 * audit row and the cache are. This is an auth surface, so what must be shown
 * is that the layers hang together: a rejected token never reaches the core, a
 * player who isn't the organiser never reads or writes a row, and a PUT from
 * the organiser ends in a write on the right row. The counting rules have their
 * own suite (`lib/games/payments.test.ts`).
 */

const GAME_ID = 'spill-1';
const CREATOR = 'oppretteren';
const ADMIN = 'klubbadmin';
const PLAYER = 'en-spiller';

const TOKENS = { creator: 'token-arrangor', admin: 'token-admin', player: 'token-spiller' };

type Row = {
  user_id: string;
  paid_at: string | null;
  withdrawn_at: string | null;
  users: { name: string | null; nickname: string | null; is_guest: boolean; email?: string; locale?: string };
};

const row = (user_id: string, over: Partial<Row> = {}): Row => ({
  user_id,
  paid_at: null,
  withdrawn_at: null,
  users: { name: user_id, nickname: null, is_guest: false, email: `${user_id}@example.test`, locale: 'no' },
  ...over,
});

let db: { gameExists: boolean; fee: number; leagueRound: string | null; players: Row[]; coreThrows: boolean };

function respond(op: QueryOp): QueryResponse {
  const value = (column: string) => op.filters.find((f) => f.column === column)?.value;
  if (op.table === 'games' && op.columns === 'created_by, league_round_id') {
    return { data: db.gameExists ? { created_by: CREATOR, league_round_id: db.leagueRound } : null };
  }
  // #2688: the simulator-league check the gate makes for the creator.
  if (op.table === 'games' && op.columns?.startsWith('id, league_round_id')) {
    return {
      data: db.leagueRound
        ? {
            id: GAME_ID,
            league_round_id: db.leagueRound,
            league_rounds: {
              id: db.leagueRound,
              label: 'Runde 1',
              league_id: 'liga',
              leagues: { id: 'liga', name: 'Vinterligaen', is_simulator: true, created_by: ADMIN },
            },
          }
        : null,
    };
  }
  if (op.table === 'users' && op.columns === 'is_admin') return { data: { is_admin: value('id') === ADMIN } };
  if (op.table === 'users' && op.columns === 'name') return { data: { name: 'Sofie Aas' } };
  if (db.coreThrows) throw new Error('connection reset to db.internal:5432');
  if (op.table === 'games') {
    return {
      data: db.gameExists
        ? { id: GAME_ID, name: 'Lørdagsrunden', status: 'scheduled', entry_fee_kr: db.fee, payment_link: '12345' }
        : null,
    };
  }
  if (op.table === 'game_players' && op.kind === 'update') {
    const hit = db.players.find((p) => p.user_id === value('user_id'));
    return { data: hit ? [{ user_id: hit.user_id }] : [] };
  }
  if (op.table === 'game_players') return { data: db.players };
  throw new Error(`uventet spørring: ${op.kind} ${op.table}`);
}

const fake = createAdminClientMock({
  tokens: { [TOKENS.creator]: CREATOR, [TOKENS.admin]: ADMIN, [TOKENS.player]: PLAYER },
  respond: (op) => respond(op),
});

vi.mock('@/lib/supabase/admin', () => ({ getAdminClient: () => fake.client }));
vi.mock('@/lib/notifications/paymentReminder', () => ({ sendPaymentReminder: vi.fn() }));
vi.mock('@/lib/admin/auditLog', () => ({ logAdminEvent: vi.fn() }));
vi.mock('@/lib/games/expireGameCache', () => ({ expireGameCache: vi.fn() }));

import { NextRequest } from 'next/server';
import { logAdminEvent } from '@/lib/admin/auditLog';
import { expireGameCache } from '@/lib/games/expireGameCache';
import { sendPaymentReminder } from '@/lib/notifications/paymentReminder';
import { GET } from './route';
import { PUT } from './[userId]/route';
import { POST } from './remind/route';

const reminderMock = vi.mocked(sendPaymentReminder);

function request(method: string, path: string, { token, body }: { token?: string; body?: unknown } = {}) {
  const headers: Record<string, string> = {};
  if (token) headers.authorization = `Bearer ${token}`;
  return new NextRequest(`http://localhost/api/games/${GAME_ID}/payments${path}`, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

const call = {
  GET: (token?: string) => GET(request('GET', '', { token }), { params: Promise.resolve({ id: GAME_ID }) }),
  PUT: (token: string | undefined, userId: string, body: unknown = { paid: true }) =>
    PUT(request('PUT', `/${userId}`, { token, body }), { params: Promise.resolve({ id: GAME_ID, userId }) }),
  POST: (token?: string) => POST(request('POST', '/remind', { token }), { params: Promise.resolve({ id: GAME_ID }) }),
};

const writes = () => fake.ops.filter((op) => op.kind !== 'select');
const playerReads = () => fake.ops.filter((op) => op.table === 'game_players');

beforeEach(() => {
  vi.clearAllMocks();
  fake.reset();
  db = {
    gameExists: true,
    fee: 200,
    leagueRound: null,
    players: [
      row(CREATOR, { paid_at: '2026-11-01T10:00:00Z', users: { name: 'Sofie Aas', nickname: null, is_guest: false } }),
      row('marte', { paid_at: '2026-11-01T11:00:00Z' }),
      row('jonas'),
      row('kristian'),
      row('gjest', { users: { name: 'Gjest', nickname: null, is_guest: true } }),
      row('trukket', { withdrawn_at: '2026-11-02T08:00:00Z' }),
    ],
    coreThrows: false,
  };
});

describe('porten, likt for alle tre', () => {
  const each = [
    ['GET', (t?: string) => call.GET(t)],
    ['PUT', (t?: string) => call.PUT(t, 'jonas')],
    ['POST', (t?: string) => call.POST(t)],
  ] as const;

  it.each(each)('%s uten token: 401, ingenting leses', async (_m, run) => {
    const res = await run();
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: 'unauthorized' });
    expect(fake.ops).toEqual([]);
  });

  it.each(each)('%s fra en spiller som ikke er arrangør: 403, ingen spillere lest', async (_m, run) => {
    const res = await run(TOKENS.player);
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ error: 'forbidden' });
    expect(playerReads()).toEqual([]);
    expect(reminderMock).not.toHaveBeenCalled();
  });

  it.each(each)('%s mot et ukjent spill: 404', async (_m, run) => {
    db.gameExists = false;
    const res = await run(TOKENS.creator);
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: 'not_found' });
    expect(writes()).toEqual([]);
  });

  it.each(each)('%s i en simulatorligaflight: 403, oppretteren er ikke arrangør der (#2688)', async (_m, run) => {
    db.leagueRound = 'runde-1';
    const res = await run(TOKENS.creator);
    expect(res.status).toBe(403);
    expect(writes()).toEqual([]);
  });

  it.each(each)('%s uten kontingent: 409 no_fee', async (_m, run) => {
    db.fee = 0;
    const res = await run(TOKENS.creator);
    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({ error: 'no_fee' });
    expect(writes()).toEqual([]);
    expect(reminderMock).not.toHaveBeenCalled();
  });

  it.each(each)('%s: en feil i basen blir 500 uten detaljene', async (_m, run) => {
    db.coreThrows = true;
    const res = await run(TOKENS.creator);
    expect(res.status).toBe(500);
    const text = await res.text();
    expect(text).toBe(JSON.stringify({ error: 'payments_failed' }));
    expect(text).not.toContain('db.internal');
  });
});

describe('GET', () => {
  it.each([
    ['oppretteren', TOKENS.creator],
    ['en klubbadmin', TOKENS.admin],
  ])('%s får lista og tellingene', async (_who, token) => {
    const res = await call.GET(token);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      entryFeeKr: 200,
      gameName: 'Lørdagsrunden',
      paidCount: 2,
      totalCount: 5,
      remindable: 2,
    });
    expect(body.players[0]).toEqual({ userId: CREATOR, name: 'Sofie Aas', isGuest: false, withdrawn: false, paid: true });
    expect(body.players.find((p: { userId: string }) => p.userId === 'trukket')).toMatchObject({ withdrawn: true });
  });
});

describe('PUT', () => {
  it('arrangøren huker av en annen spiller: én skriving på riktig rad, audit og cache', async () => {
    const res = await call.PUT(TOKENS.creator, 'jonas', { paid: true });
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ paid: true });
    const [update] = writes();
    expect(update.table).toBe('game_players');
    expect(update.payload?.paid_at).toEqual(expect.any(String));
    expect(update.filters).toEqual(
      expect.arrayContaining([
        { op: 'eq', column: 'game_id', value: GAME_ID },
        { op: 'eq', column: 'user_id', value: 'jonas' },
      ]),
    );
    expect(logAdminEvent).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: CREATOR, actorName: 'Sofie Aas', eventType: 'game.player_marked_paid' }),
    );
    expect(expireGameCache).toHaveBeenCalledWith(GAME_ID);
  });

  it('arrangøren huker av seg selv, og fjerner haken igjen', async () => {
    expect((await call.PUT(TOKENS.creator, CREATOR, { paid: true })).status).toBe(200);
    expect((await call.PUT(TOKENS.creator, CREATOR, { paid: false })).status).toBe(200);
    expect(writes().map((op) => op.payload?.paid_at === null)).toEqual([false, true]);
    expect(logAdminEvent).toHaveBeenLastCalledWith(expect.objectContaining({ eventType: 'game.player_marked_unpaid' }));
  });

  it('en spiller uten rad i spillet: 404, ingen skriving', async () => {
    const res = await call.PUT(TOKENS.creator, 'en-annen');
    expect(res.status).toBe(404);
    expect(writes()).toEqual([]);
  });

  it.each([[{}], [{ paid: 'ja' }], [null]])('en kropp uten boolsk paid (%j): 400', async (body) => {
    const res = await call.PUT(TOKENS.creator, 'jonas', body);
    expect(res.status).toBe(400);
    expect(writes()).toEqual([]);
  });

  it('en spiller som prøver å huke av seg selv: 403', async () => {
    const res = await call.PUT(TOKENS.player, PLAYER, { paid: true });
    expect(res.status).toBe(403);
    expect(writes()).toEqual([]);
  });
});

describe('POST remind', () => {
  it('purrer de som mangler: ikke betalte, ikke trukne, ikke gjester', async () => {
    const res = await call.POST(TOKENS.creator);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ reminded: 2 });
    expect(reminderMock.mock.calls.map((c) => c[0].player.userId)).toEqual(['jonas', 'kristian']);
    expect(reminderMock.mock.calls[0][0].game).toEqual({
      id: GAME_ID,
      name: 'Lørdagsrunden',
      entryFeeKr: 200,
      paymentLink: '12345',
    });
  });
});
