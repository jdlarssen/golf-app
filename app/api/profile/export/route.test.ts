// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createAdminClientMock,
  type QueryOp,
  type QueryResponse,
} from '@/lib/supabase/testing/adminClientMock';

/**
 * Type A (#2332): appens dør til «Last ned dataene dine».
 *
 * Adgangssjekken (`authenticatedUserId`) og kjernen (`buildUserExport`) er
 * EKTE: dette er en auth-flate som leser personopplysninger med service-rollen,
 * og det som må bevises er at lagene henger sammen. Bare klientene er dobler,
 * og `callerScopedClient` gir dobbelen for kallerens klient.
 *
 *  1. Uten token, og med et token GoTrue avviser, svarer ruta 401 uten å lese.
 *  2. **En annens data:** et gyldig token for A med B i query og header gir
 *     A sin fil. Kjernen får bare A, ingen lesing nevner B, og svaret har ingen
 *     rad med B. Dobbelen svarer med id-en den ble filtrert på, så en B som
 *     slapp gjennom, ville stått i svaret.
 *  3. En lesefeil gir 500 med den faste koden, uten `error.message`.
 */

const A = 'spiller-a';
const B = 'spiller-b';
const TOKEN_A = 'token-a';

let failing: string | null;

/** Svarer med id-en lesingen var filtrert på, så filteret synes i fila. */
function respond(op: QueryOp): QueryResponse {
  if (op.kind !== 'select') throw new Error(`uventet ${op.kind} ${op.table}`);
  if (failing === op.table) return { data: null, error: { message: 'relation "x" does not exist' } };
  const eq = op.filters.find((f) => f.op === 'eq');
  const owner = (eq?.value as string | undefined) ?? 'ingen';
  if (op.table === 'users') return { data: { id: owner, email: `${owner}@example.test` } };
  return { data: [{ id: `${op.table}-1`, user_id: owner }] };
}

const admin = createAdminClientMock({ tokens: { [TOKEN_A]: A }, respond });
const caller = createAdminClientMock({ respond });

vi.mock('@/lib/supabase/admin', () => ({ getAdminClient: () => admin.client }));
vi.mock('@/lib/api/appAuth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/appAuth')>()),
  callerScopedClient: () => caller.client,
}));
vi.mock('@/lib/profile/exportCore', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/profile/exportCore')>();
  return { ...real, buildUserExport: vi.fn(real.buildUserExport) };
});

import { NextRequest } from 'next/server';
import { buildUserExport } from '@/lib/profile/exportCore';
import { GET } from './route';

function request(token?: string, path = '/api/profile/export', headers: Record<string, string> = {}) {
  const all = { ...headers, ...(token ? { authorization: `Bearer ${token}` } : {}) };
  return new NextRequest(`http://localhost${path}`, { method: 'GET', headers: all });
}

beforeEach(() => {
  admin.reset();
  caller.reset();
  failing = null;
  vi.mocked(buildUserExport).mockClear();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-20T09:00:00Z'));
  vi.spyOn(console, 'error').mockImplementation(() => {});
  return () => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  };
});

describe('GET /api/profile/export', () => {
  it('uten token → 401 uten noen lesing', async () => {
    const res = await GET(request());

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'unauthorized' });
    expect([...admin.ops, ...caller.ops]).toEqual([]);
  });

  it('et token GoTrue avviser → 401 uten noen lesing', async () => {
    const res = await GET(request('token-som-ikke-finnes'));

    expect(res.status).toBe(401);
    expect([...admin.ops, ...caller.ops]).toEqual([]);
  });

  it.each([
    ['?userId=', `/api/profile/export?userId=${B}`, {}],
    ['?user_id=', `/api/profile/export?user_id=${B}`, {}],
    ['headeren x-torny-user-id', '/api/profile/export', { 'x-torny-user-id': B }],
  ])('B i %s gir likevel A sin fil, og ingen lesing nevner B', async (_where, path, headers) => {
    const res = await GET(request(TOKEN_A, path, headers));

    expect(res.status).toBe(200);
    expect(vi.mocked(buildUserExport).mock.calls.map(([id]) => id)).toEqual([A]);
    const filters = [...admin.ops, ...caller.ops].flatMap((op) => op.filters.map((f) => String(f.value)));
    expect(filters.some((value) => value.includes(B))).toBe(false);
    const body = await res.text();
    expect(body).not.toContain(B);
    expect(JSON.parse(body).user.id).toBe(A);
  });

  it('svarer med fila som JSON, med de samme nøklene som nettsiden', async () => {
    const res = await GET(request(TOKEN_A));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.exported_at).toBe('2026-11-20T09:00:00.000Z');
    expect(body.notifications).toEqual([{ id: 'notifications-1', user_id: A }]);
    expect(body.idea_submissions).toEqual([{ id: 'idea_submissions-1', user_id: A }]);
  });

  it.each(['users', 'notifications', 'reactions'])('lesefeil i %s → 500 export_failed uten feilteksten', async (table) => {
    failing = table;

    const res = await GET(request(TOKEN_A));

    expect(res.status).toBe(500);
    const body = await res.text();
    expect(JSON.parse(body)).toEqual({ error: 'export_failed' });
    expect(body).not.toContain('relation');
  });
});
