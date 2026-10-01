// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createAdminClientMock,
  type QueryOp,
  type QueryResponse,
} from '@/lib/supabase/testing/adminClientMock';

/**
 * Type A (#2265): del-rutas port og transport.
 *
 * Adgangssjekken (`authenticatedUserId`) og kjernen (`logKavalkadeShareFor`) er
 * de ekte — bare Supabase er byttet. Kjernens grener har sin egen suite
 * (`lib/kavalkade/logKavalkadeShare.test.ts`); her må det bevises at
 * spilleren bare kommer fra tokenet, og at hvert utfall får sin HTTP-kode.
 */

const USER = 'spiller';
const OTHER = 'en-annen';
const TOKEN = 'token-spiller';

let insertResponse: QueryResponse;

function respond(op: QueryOp): QueryResponse {
  if (op.table === 'kavalkade_shares' && op.kind === 'insert') return insertResponse;
  throw new Error(`uventet spørring: ${op.kind} ${op.table}`);
}

const fake = createAdminClientMock({
  tokens: { [TOKEN]: USER },
  respond: (op) => respond(op),
});

vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => fake.client,
}));

import { NextRequest } from 'next/server';
import { POST } from './route';

function request({
  year = '2026',
  token,
  body = { cardKind: 'best-round' },
  rawBody,
}: { year?: string; token?: string; body?: unknown; rawBody?: string } = {}) {
  const headers: Record<string, string> = {};
  if (token !== undefined) headers.authorization = token;
  return new NextRequest(`http://localhost/api/kavalkade/${year}/share`, {
    method: 'POST',
    headers,
    body: rawBody ?? JSON.stringify(body),
  });
}

const ctx = (year = '2026') => ({ params: Promise.resolve({ year }) });

/** Innsettingen mot `kavalkade_shares`, eller `undefined` når ingen skriving skjedde. */
function insertOp() {
  return fake.ops.find((op) => op.table === 'kavalkade_shares' && op.kind === 'insert');
}

beforeEach(() => {
  vi.clearAllMocks();
  fake.reset();
  insertResponse = { data: [{ id: 'row-1' }] };
});

describe('porten', () => {
  it('uten Authorization-header: 401, ingenting telles', async () => {
    const res = await POST(request(), ctx());

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: 'unauthorized' });
    expect(fake.getUserCalls).toEqual([]);
    expect(fake.ops).toEqual([]);
  });

  it('med et token GoTrue avviser: 401, ingenting telles', async () => {
    const res = await POST(request({ token: 'Bearer utgatt-token' }), ctx());

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: 'unauthorized' });
    expect(fake.ops).toEqual([]);
  });
});

describe('POST — tellingen', () => {
  it('200 og én rad med spilleren fra tokenet — en userId i kroppen ignoreres', async () => {
    const res = await POST(
      request({ token: `Bearer ${TOKEN}`, body: { cardKind: 'best-round', userId: OTHER } }),
      ctx(),
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
    expect(insertOp()?.payload).toEqual({
      user_id: USER,
      year: 2026,
      card_kind: 'best-round',
    });
  });

  it.each<[string, { year?: string; body?: unknown; rawBody?: string }]>([
    ['en ukjent kort-slug', { body: { cardKind: 'beste-runde' } }],
    ['uten cardKind', { body: {} }],
    ['en cardKind som ikke er tekst', { body: { cardKind: 7 } }],
    ['en kropp som ikke er JSON', { rawBody: 'ikke json' }],
    ['et år som ikke er et helt tall', { year: '2026.5' }],
    ['et år som ikke er et tall', { year: 'abc' }],
  ])('%s: 400 unknown_card — samme kode som actionen — og ingenting skrives', async (_navn, opts) => {
    const res = await POST(request({ token: `Bearer ${TOKEN}`, ...opts }), ctx(opts.year));

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: 'unknown_card' });
    expect(insertOp()).toBeUndefined();
  });
});

describe('feil under panseret', () => {
  it.each<[string, QueryResponse]>([
    ['en null-rads skriving', { data: [] }],
    ['en databasefeil', { data: null, error: { message: 'permission denied' } }],
  ])('%s: 500 db_error med en ugjennomsiktig kode', async (_navn, response) => {
    insertResponse = response;
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await POST(request({ token: `Bearer ${TOKEN}` }), ctx());

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: 'db_error' });
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
