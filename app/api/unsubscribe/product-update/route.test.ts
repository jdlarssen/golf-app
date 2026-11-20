import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { buildSupabaseMock } from '@/tests/serverActionMocks';

/**
 * Unit tests for the public product-update unsubscribe endpoint (#202).
 *
 * #2054: the users write must hit a row. A signed token for a user that no
 * longer exists (hard-deleted account) must not answer «Du er meldt av».
 *
 * Audit 20.11: a GET never unsubscribes. Mail scanners open links, so the link
 * shows a page with a button, and only the POST behind it (or the mail
 * client's RFC 8058 one-click POST) writes.
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

/** The POST the page's button sends: the token in the URL, `page=1` in the form. */
function buttonPost(token = 'tok'): NextRequest {
  return new NextRequest(`https://tornygolf.no/api/unsubscribe/product-update?token=${token}`, {
    method: 'POST',
    body: new URLSearchParams({ page: '1' }),
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
  });
}

/** The RFC 8058 one-click POST a mail client sends. */
function oneClickPost(token = 'tok'): NextRequest {
  return new NextRequest(`https://tornygolf.no/api/unsubscribe/product-update?token=${token}`, {
    method: 'POST',
    body: new URLSearchParams({ 'List-Unsubscribe': 'One-Click' }),
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  verifyMock.mockReturnValue({ userId: USER_ID });
});

describe('product-update unsubscribe — a GET never writes (audit 20.11)', () => {
  it('valid token → GET 200 with a button that posts back, and users is never touched', async () => {
    adminMock = buildSupabaseMock([]);
    const res = await GET(req('GET'));
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('<form method="post" action="/api/unsubscribe/product-update?token=tok">');
    expect(html).toContain('<input type="hidden" name="page" value="1">');
    expect(html).not.toContain('Du er meldt av');
    expect(adminMock.from).not.toHaveBeenCalled();
  });

  it('the token is escaped in the form', async () => {
    adminMock = buildSupabaseMock([]);
    const res = await GET(req('GET', encodeURIComponent('a"b<c')));
    expect(await res.text()).toContain('action="/api/unsubscribe/product-update?token=a%22b%3Cc"');
  });

  it('invalid token → GET 400 «Lenken er ugyldig», no button', async () => {
    adminMock = buildSupabaseMock([]);
    verifyMock.mockReturnValue(null);
    const res = await GET(req('GET'));
    expect(res.status).toBe(400);
    const html = await res.text();
    expect(html).toContain('Lenken er ugyldig');
    expect(html).not.toContain('<form');
  });
});

describe('product-update unsubscribe — the users write must hit the row (#2054)', () => {
  it('the button: valid token and 1 row → 200 «Du er meldt av»', async () => {
    adminMock = buildSupabaseMock([{ data: [{ id: USER_ID }], error: null }]);
    const res = await POST(buttonPost());
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('Du er meldt av månedsbrevet');
    expect(adminMock.__fromCalls.map((c) => c.method)).toEqual(['update', 'eq', 'select']);
  });

  it('one-click: valid token and 1 row → 200 with an empty body', async () => {
    adminMock = buildSupabaseMock([{ data: [{ id: USER_ID }], error: null }]);
    const res = await POST(oneClickPost());
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('');
  });

  it('a bare POST (no body) still unsubscribes', async () => {
    adminMock = buildSupabaseMock([{ data: [{ id: USER_ID }], error: null }]);
    const res = await POST(req('POST'));
    expect(res.status).toBe(200);
  });

  it('the button: 0 rows → 404 with the account-not-found text', async () => {
    adminMock = buildSupabaseMock([{ data: [], error: null }]);
    const res = await POST(buttonPost());
    expect(res.status).toBe(404);
    const html = await res.text();
    expect(html).toContain('Vi finner ikke kontoen din');
    expect(html).not.toContain('Du er meldt av');
  });

  it('one-click: 0 rows → 404', async () => {
    adminMock = buildSupabaseMock([{ data: [], error: null }]);
    const res = await POST(oneClickPost());
    expect(res.status).toBe(404);
  });

  it('the button: DB error → 400 «Lenken er ugyldig»', async () => {
    adminMock = buildSupabaseMock([{ data: null, error: { message: 'boom' } }]);
    const res = await POST(buttonPost());
    expect(res.status).toBe(400);
    expect(await res.text()).toContain('Lenken er ugyldig');
  });

  it('invalid token → POST 400, and users is never touched', async () => {
    adminMock = buildSupabaseMock([]);
    verifyMock.mockReturnValue(null);
    const post = await POST(oneClickPost());
    expect(post.status).toBe(400);
    expect(adminMock.from).not.toHaveBeenCalled();
  });
});
