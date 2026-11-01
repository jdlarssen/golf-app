// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * Type A (#2748): the paths that send a link on must reach their route without a
 * login. A logged-out person opening a mail gets the login from the page behind
 * it, with the invitation card or the `next` it needs. `/games/*` keeps its gate.
 */

const getUser = vi.fn(async () => ({ data: { user: null } }));
vi.mock('@/lib/supabase/middleware', () => ({
  createMiddlewareClient: () => ({
    supabase: { auth: { getUser } },
    response: new Response(null),
  }),
}));

// The routing itself is next-intl's. Here only the auth gate in front of it counts.
vi.mock('next-intl/middleware', () => ({ default: () => () => new Response(null) }));

import { proxy } from './proxy';

const ID = '44444444-4444-4444-8444-444444444444';

const request = (path: string) => new NextRequest(`https://tornygolf.no${path}`);

beforeEach(() => getUser.mockClear());

describe('proxy and the link paths', () => {
  it.each([
    `/invitasjon/${ID}?email=a%40b.no`,
    `/en/invitasjon/${ID}`,
    `/runde/${ID}`,
    `/runde/${ID}/holes/7`,
    `/en/runde/${ID}/leaderboard`,
  ])('%s is not sent to the login, and asks for no session', async (path) => {
    const res = await proxy(request(path));
    expect(res.headers.get('location') ?? '').not.toContain('/login');
    expect(getUser).not.toHaveBeenCalled();
  });

  it('the page behind it still needs a login', async () => {
    const res = await proxy(request(`/games/${ID}`));
    expect(res.headers.get('location')).toContain('/login');
    expect(getUser).toHaveBeenCalled();
  });
});
