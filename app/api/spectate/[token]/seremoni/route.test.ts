import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildSupabaseMock } from '@/tests/serverActionMocks';

// Type A (#2298): the big screen's step route. One lookup on the token; a
// DB error is a 500 (the TV asks again), a miss or a game not yet visible a
// 404, and the answer says whether the game is still finished.

let client: ReturnType<typeof buildSupabaseMock>;
vi.mock('@/lib/supabase/admin', () => ({ getAdminClient: () => client }));

const TOKEN = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const ctx = (token: string) => ({ params: Promise.resolve({ token }) });

async function call(token = TOKEN) {
  const { GET } = await import('./route');
  const res = await GET(new Request(`http://localhost/api/spectate/${token}/seremoni`), ctx(token));
  return { status: res.status, body: await res.json(), cache: res.headers.get('cache-control') };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/spectate/[token]/seremoni', () => {
  it('a finished game: its step, no-store', async () => {
    client = buildSupabaseMock([{ data: { status: 'finished', ceremony_step: 2 }, error: null }]);
    expect(await call()).toEqual({ status: 200, body: { step: 2, finished: true }, cache: 'no-store' });
    const eqs = client.__fromCalls.filter((c) => c.method === 'eq').map((c) => c.args);
    expect(eqs).toEqual([['spectate_token', TOKEN]]);
  });

  it('a reopened game: finished false, so the TV leaves «Ferdig spilt»', async () => {
    client = buildSupabaseMock([{ data: { status: 'active', ceremony_step: null }, error: null }]);
    expect((await call()).body).toEqual({ step: null, finished: false });
  });

  it.each(['draft', 'scheduled'])('a %s game is not there yet: 404, like the live page', async (status) => {
    client = buildSupabaseMock([{ data: { status, ceremony_step: null }, error: null }]);
    expect((await call()).status).toBe(404);
  });

  it('an unknown or turned-off token: 404', async () => {
    client = buildSupabaseMock([{ data: null, error: null }]);
    expect((await call()).status).toBe(404);
  });

  it('a token that is not a UUID: 404 without a query', async () => {
    client = buildSupabaseMock([]);
    expect((await call('nope')).status).toBe(404);
    expect(client.__fromCalls).toEqual([]);
  });

  it('a DB error: 500, never a 404', async () => {
    client = buildSupabaseMock([{ data: null, error: { message: 'boom' } }]);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect((await call()).status).toBe(500);
  });
});
