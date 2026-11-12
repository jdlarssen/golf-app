// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createAdminClientMock } from '@/lib/supabase/testing/adminClientMock';

/**
 * Type C (#2839): «Meld deg av ligaen» from the app. The rule is the SQL function
 * `leave_club_league` (0086, real DB on staging); here stands what the route does
 * with each answer it can give, and that the call is the caller's own: the
 * caller-scoped client, never the service role, and no id from the body.
 */

const ME = '11111111-1111-4111-8111-111111111111';
const LEAGUE_ID = '44444444-4444-4444-8444-444444444444';

const fake = createAdminClientMock({
  tokens: { 'token-meg': ME },
  respond: () => {
    throw new Error('ruta skriver ikke med admin-klienten');
  },
});
vi.mock('@/lib/supabase/admin', () => ({ getAdminClient: () => fake.client }));

const rpc = vi.fn();
vi.mock('@/lib/api/appAuth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/appAuth')>();
  return { ...actual, callerScopedClient: () => ({ rpc }) };
});

const revalidatePath = vi.fn();
vi.mock('next/cache', () => ({ revalidatePath: (...args: unknown[]) => revalidatePath(...args) }));

import { NextRequest } from 'next/server';
import { POST } from './route';

async function call(token?: string, id = LEAGUE_ID, body?: unknown) {
  const headers: Record<string, string> = {};
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await POST(
    new NextRequest(`http://localhost/api/liga/${id}/meld-av`, {
      method: 'POST',
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  );
  return { status: res.status, body: await res.json() };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  fake.reset();
  rpc.mockResolvedValue({ data: 'left', error: null });
});

describe('POST /api/liga/[id]/meld-av', () => {
  it.each(['left'])('%s is 200 and the league page is revalidated', async (code) => {
    rpc.mockResolvedValueOnce({ data: code, error: null });
    expect(await call('token-meg')).toEqual({ status: 200, body: { leagueId: LEAGUE_ID } });
    expect(revalidatePath).toHaveBeenCalledWith(`/liga/${LEAGUE_ID}`);
  });

  it.each(['finished', 'not_member', 'already_played', 'not_club_league'])('%s is 409 with the same code', async (code) => {
    rpc.mockResolvedValueOnce({ data: code, error: null });
    expect(await call('token-meg')).toEqual({ status: 409, body: { error: code } });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('401 without a token, and the function is never called', async () => {
    expect({ ...(await call()), calls: rpc.mock.calls.length }).toEqual({
      status: 401,
      body: { error: 'unauthorized' },
      calls: 0,
    });
  });

  it('404 for an id that is no uuid, and for a league the function says does not exist', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'league_not_found' } });
    expect([await call('token-meg', 'liga-1'), await call('token-meg')]).toEqual([
      { status: 404, body: { error: 'not_found' } },
      { status: 404, body: { error: 'not_found' } },
    ]);
  });

  it('calls the function as the caller, with the league id from the path only', async () => {
    await call('token-meg', LEAGUE_ID, { user_id: '99999999-9999-4999-8999-999999999999', league_id: 'x' });
    expect({ calls: rpc.mock.calls, adminOps: fake.ops.filter((op) => op.kind !== 'select') }).toEqual({
      calls: [['leave_club_league', { p_league_id: LEAGUE_ID }]],
      adminOps: [],
    });
  });

  it('a function error or an unknown answer is 500 save_failed', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'boom' } });
    rpc.mockResolvedValueOnce({ data: 'something_new', error: null });
    expect([await call('token-meg'), await call('token-meg')]).toEqual([
      { status: 500, body: { error: 'save_failed' } },
      { status: 500, body: { error: 'save_failed' } },
    ]);
  });
});
