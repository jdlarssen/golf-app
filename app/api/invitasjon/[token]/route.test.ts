// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAdminClientMock } from '@/lib/supabase/testing/adminClientMock';

/**
 * Type A (#2748): the route around `openInvitation`, which has its own suite. Here
 * stands what the route answers for: nothing without a token, the caller and the
 * address only from the token, the invitation only from the path.
 */

const ME = '11111111-1111-4111-8111-111111111111';
const TOKEN = '44444444-4444-4444-8444-444444444444';
const GAME = '55555555-5555-4555-8555-555555555555';

const fake = createAdminClientMock({
  tokens: { 'token-meg': { id: ME, email: 'kari@example.test' }, 'token-uten-epost': { id: ME, email: null } },
  respond: () => ({ data: null }),
});
vi.mock('@/lib/supabase/admin', () => ({ getAdminClient: () => fake.client }));

const coreMock = vi.fn();
vi.mock('@/lib/auth/openInvitation', () => ({ openInvitation: (...args: unknown[]) => coreMock(...args) }));

import { NextRequest } from 'next/server';
import { POST } from './route';

function request(token: string | null, body?: unknown) {
  return new NextRequest(`https://tornygolf.no/api/invitasjon/${TOKEN}`, {
    method: 'POST',
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

const params = { params: Promise.resolve({ token: TOKEN }) };

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://x.supabase.co');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon');
  coreMock.mockResolvedValue({ status: 'in_game', gameId: GAME });
});

describe('POST /api/invitasjon/[token]', () => {
  it.each([
    ['no token', null],
    ['a token that does not validate', 'token-ukjent'],
    ['a token without an address', 'token-uten-epost'],
  ])('401 with %s, and opens nothing', async (_label, token) => {
    const res = await POST(request(token), params);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'unauthorized' });
    expect(coreMock).not.toHaveBeenCalled();
  });

  it('asks about the caller from the token and the invitation from the path; the body is ignored', async () => {
    const res = await POST(
      request('token-meg', { email: 'annen@example.test', userId: 'en-annen', token: 'en-annen-token' }),
      params,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'in_game', gameId: GAME });
    expect(coreMock).toHaveBeenCalledWith(expect.anything(), {
      token: TOKEN,
      userId: ME,
      email: 'kari@example.test',
    });
  });

  it.each(['started', 'no_game', 'other_account'])('200 %s, with no round in the answer', async (status) => {
    coreMock.mockResolvedValue({ status });
    const res = await POST(request('token-meg'), params);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status });
  });

  it('404 for a token that does not exist', async () => {
    coreMock.mockResolvedValue(null);
    const res = await POST(request('token-meg'), params);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'not_found' });
  });

  it('500 when the core throws, with no detail', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    coreMock.mockRejectedValue(new Error('hemmelig'));
    const res = await POST(request('token-meg'), params);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'open_failed' });
    errorSpy.mockRestore();
  });
});
