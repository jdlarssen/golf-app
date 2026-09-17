import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { buildSupabaseMock } from '@/tests/serverActionMocks';

/**
 * Unit tests for the public product-update unsubscribe endpoint (#202).
 *
 * #2054: the users write must hit a row. A signed token for a user that no
 * longer exists (hard-deleted account) must not answer «Du er meldt av».
 */

vi.mock('server-only', () => ({}));

let adminMock: ReturnType<typeof buildSupabaseMock>;
vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => adminMock,
}));

const verifyMock = vi.fn();
vi.mock('@/lib/productUpdates/unsubscribeToken', () => ({
  verifyUnsubToken: (token: string) => verifyMock(token),
}));

import { GET, POST } from './route';

const USER_ID = '00000000-0000-4000-8000-000000000001';

function req(method: 'GET' | 'POST', token = 'tok'): NextRequest {
  return new NextRequest(`https://tornygolf.no/api/unsubscribe/product-update?token=${token}`, {
    method,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  verifyMock.mockReturnValue({ userId: USER_ID });
});

describe('product-update unsubscribe — the users write must hit the row (#2054)', () => {
  it('valid token and 1 row → GET 200 «Du er meldt av»', async () => {
    adminMock = buildSupabaseMock([{ data: [{ id: USER_ID }], error: null }]);
    const res = await GET(req('GET'));
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('Du er meldt av månedsbrevet');
    expect(adminMock.__fromCalls.map((c) => c.method)).toEqual(['update', 'eq', 'select']);
  });

  it('valid token and 1 row → POST 200', async () => {
    adminMock = buildSupabaseMock([{ data: [{ id: USER_ID }], error: null }]);
    const res = await POST(req('POST'));
    expect(res.status).toBe(200);
  });

  it('0 rows → GET 404 with the account-not-found text', async () => {
    adminMock = buildSupabaseMock([{ data: [], error: null }]);
    const res = await GET(req('GET'));
    expect(res.status).toBe(404);
    const html = await res.text();
    expect(html).toContain('Vi finner ikke kontoen din');
    expect(html).not.toContain('Du er meldt av');
  });

  it('0 rows → POST 404', async () => {
    adminMock = buildSupabaseMock([{ data: [], error: null }]);
    const res = await POST(req('POST'));
    expect(res.status).toBe(404);
  });

  it('DB error → GET 400 «Lenken er ugyldig»', async () => {
    adminMock = buildSupabaseMock([{ data: null, error: { message: 'boom' } }]);
    const res = await GET(req('GET'));
    expect(res.status).toBe(400);
    expect(await res.text()).toContain('Lenken er ugyldig');
  });

  it('invalid token → 400, and users is never touched', async () => {
    adminMock = buildSupabaseMock([]);
    verifyMock.mockReturnValue(null);
    const get = await GET(req('GET'));
    const post = await POST(req('POST'));
    expect(get.status).toBe(400);
    expect(post.status).toBe(400);
    expect(adminMock.from).not.toHaveBeenCalled();
  });
});
