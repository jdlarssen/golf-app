// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createAdminClientMock,
  type QueryOp,
  type QueryResponse,
} from '@/lib/supabase/testing/adminClientMock';

/**
 * Type A (#2215): rutas port og transport.
 *
 * Porten (`gameRefreshAccess` i `lib/api/appAuth.ts`) er ekte — bare Supabase
 * og `next/cache` er stubbet. Det som må bevises er at bare arrangøren og aktive
 * spillere i runden får tømt cachen, og at en som får nei ikke tømmer noe.
 * Hele tilgangs-tabellen bor i `lib/api/appAuth.test.ts`.
 */

const GAME_ID = 'spill-1';
const CREATOR = 'oppretteren';
const PLAYER = 'aktiv-spiller';
const WITHDRAWN = 'trukket-spiller';
const ADMIN = 'klubb-admin';
const STRANGER = 'en-fremmed';

const TOKENS: Record<string, string> = {
  'token-oppretter': CREATOR,
  'token-spiller': PLAYER,
  'token-trukket': WITHDRAWN,
  'token-admin': ADMIN,
  'token-fremmed': STRANGER,
};
const bearer = (userId: string) =>
  `Bearer ${Object.keys(TOKENS).find((t) => TOKENS[t] === userId)}`;

let db: { gameExists: boolean; throws: boolean };

function respond(op: QueryOp): QueryResponse {
  const value = (column: string) =>
    op.filters.find((f) => f.column === column)?.value as string | undefined;

  if (db.throws) throw new Error('connection reset');
  if (op.table === 'games') {
    return {
      data: db.gameExists && value('id') === GAME_ID ? { created_by: CREATOR } : null,
    };
  }
  if (op.table === 'users') return { data: { is_admin: value('id') === ADMIN } };
  if (op.table === 'game_players') {
    // Bare aktive rader svarer: porten filtrerer på `withdrawn_at IS NULL`.
    const active = [CREATOR, PLAYER];
    return {
      data:
        value('game_id') === GAME_ID && active.includes(value('user_id') ?? '')
          ? { user_id: value('user_id') }
          : null,
    };
  }
  throw new Error(`uventet spørring: ${op.kind} ${op.table}`);
}

const fake = createAdminClientMock({ tokens: TOKENS, respond: (op) => respond(op) });

vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => fake.client,
}));
const revalidateTagMock = vi.fn();
vi.mock('next/cache', () => ({
  revalidateTag: (...args: unknown[]) => revalidateTagMock(...args),
  revalidatePath: vi.fn(),
}));

import { NextRequest } from 'next/server';
import { POST } from './route';

function request({
  token,
  query = '',
  body,
}: { token?: string; query?: string; body?: unknown } = {}) {
  const headers: Record<string, string> = {};
  if (token !== undefined) headers.authorization = token;
  return new NextRequest(`http://localhost/api/games/${GAME_ID}/refresh${query}`, {
    method: 'POST',
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

const ctx = () => ({ params: Promise.resolve({ id: GAME_ID }) });

const expired = () => revalidateTagMock.mock.calls;

beforeEach(() => {
  vi.clearAllMocks();
  fake.reset();
  db = { gameExists: true, throws: false };
});

describe('porten', () => {
  it('uten Authorization-header: 401 før noe leses', async () => {
    const res = await POST(request(), ctx());

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: 'unauthorized' });
    expect(fake.getUserCalls).toEqual([]);
    expect(fake.ops).toEqual([]);
    expect(expired()).toEqual([]);
  });

  it('med et token GoTrue avviser: 401, ingenting kjøres', async () => {
    const res = await POST(request({ token: 'Bearer utgatt-token' }), ctx());

    expect(res.status).toBe(401);
    expect(fake.getUserCalls).toEqual(['utgatt-token']);
    expect(fake.ops).toEqual([]);
    expect(expired()).toEqual([]);
  });

  it.each([
    ['en trukket spiller', WITHDRAWN],
    ['en fremmed', STRANGER],
  ])('%s: 403, cachen står', async (_navn, caller) => {
    const res = await POST(request({ token: bearer(caller) }), ctx());

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ error: 'forbidden' });
    expect(expired()).toEqual([]);
  });

  it.each([ADMIN, PLAYER])('mot et ukjent spill: 404 — også for %s', async (caller) => {
    db.gameExists = false;

    const res = await POST(request({ token: bearer(caller) }), ctx());

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: 'not_found' });
    expect(expired()).toEqual([]);
  });
});

describe('POST — tømmingen', () => {
  it.each([
    ['en aktiv spiller som ikke er arrangør', PLAYER],
    ['arrangøren', CREATOR],
    ['en admin', ADMIN],
  ])('%s: 200 {} og cachen tømmes én gang', async (_navn, caller) => {
    const res = await POST(request({ token: bearer(caller) }), ctx());

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({});
    expect(expired()).toEqual([[`game-${GAME_ID}`, { expire: 0 }]]);
    // Ruta skriver aldri.
    expect(fake.ops.every((op) => op.kind === 'select')).toBe(true);
  });

  it('en spill-id i kropp og query ignoreres — stien er kilden', async () => {
    const res = await POST(
      request({
        token: bearer(PLAYER),
        query: '?id=et-annet-spill&gameId=et-annet-spill',
        body: { gameId: 'et-annet-spill', userId: STRANGER },
      }),
      ctx(),
    );

    expect(res.status).toBe(200);
    expect(expired()).toEqual([[`game-${GAME_ID}`, { expire: 0 }]]);
    const gameIds = fake.ops.flatMap((op) =>
      op.filters
        .filter((f) => f.column === 'game_id' || (op.table === 'games' && f.column === 'id'))
        .map((f) => f.value),
    );
    expect(new Set(gameIds)).toEqual(new Set([GAME_ID]));
  });
});

describe('feil under panseret', () => {
  it('et kast blir 500 med en ugjennomsiktig kode', async () => {
    db.throws = true;
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await POST(request({ token: bearer(PLAYER) }), ctx());

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: 'refresh_failed' });
    expect(errorSpy).toHaveBeenCalledWith(
      '[api/games/[id]/refresh] refresh threw',
      expect.any(Error),
    );
    expect(expired()).toEqual([]);
    errorSpy.mockRestore();
  });
});
