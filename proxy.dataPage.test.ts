// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * #2332: «Dine data» (`/profile/konto`) sits behind the login like every
 * profile route. Without a session the proxy sends the visitor to the login
 * with the page in `next`, so they land back on it, in their own locale.
 * The page itself reads no data; this gate is what keeps it private.
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

const request = (path: string) => new NextRequest(`https://tornygolf.no${path}`);

beforeEach(() => getUser.mockClear());

describe('proxy and «Dine data»', () => {
  it.each([
    ['/profile/konto', '/login?next=%2Fprofile%2Fkonto'],
    ['/en/profile/konto', '/en/login?next=%2Fen%2Fprofile%2Fkonto'],
  ])('%s without a session goes to %s', async (path, target) => {
    const res = await proxy(request(path));

    expect(getUser).toHaveBeenCalled();
    const location = new URL(res.headers.get('location') ?? '', 'https://tornygolf.no');
    expect(`${location.pathname}${location.search}`).toBe(target);
  });
});
