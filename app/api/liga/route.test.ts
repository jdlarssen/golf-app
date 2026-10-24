// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createAdminClientMock } from '@/lib/supabase/testing/adminClientMock';

/**
 * Type A (#2638): rutas port for «Ligaene dine». Sammenstillingen
 * (`getMyLeagues` / `assembleMyLeagues`) har sin egen suite; her står at id-en
 * bare kommer fra tokenet, og at en feil blir 500 som appen skjuler.
 */

const ME = '11111111-1111-4111-8111-111111111111';

const fake = createAdminClientMock({
  tokens: { 'token-meg': ME },
  respond: () => {
    throw new Error('ruta leser ikke selv med admin-klienten');
  },
});
vi.mock('@/lib/supabase/admin', () => ({ getAdminClient: () => fake.client }));

const getMyLeagues = vi.fn();
vi.mock('@/lib/league/getMyLeagues', () => ({
  getMyLeagues: (...args: unknown[]) => getMyLeagues(...args),
}));

import { NextRequest } from 'next/server';
import { GET } from './route';

async function call(token?: string, query = '') {
  const headers: Record<string, string> = {};
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await GET(new NextRequest(`http://localhost/api/liga${query}`, { headers }));
  return { status: res.status, body: await res.json() };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  getMyLeagues.mockResolvedValue([]);
});

describe('GET /api/liga', () => {
  it('401 without a token, and nothing is read', async () => {
    expect({ ...(await call()), read: getMyLeagues.mock.calls.length }).toEqual({
      status: 401,
      body: { error: 'unauthorized' },
      read: 0,
    });
  });

  it('reads the leagues of the token’s user only, whatever the query says', async () => {
    const res = await call('token-meg', `?userId=99999999-9999-4999-8999-999999999999`);
    expect({ res, args: getMyLeagues.mock.calls[0] }).toEqual({
      res: { status: 200, body: { leagues: [] } },
      args: [ME],
    });
  });

  it('a failed read is 500 load_failed', async () => {
    getMyLeagues.mockRejectedValueOnce(new Error('boom'));
    expect(await call('token-meg')).toEqual({ status: 500, body: { error: 'load_failed' } });
  });
});
