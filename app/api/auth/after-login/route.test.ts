// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { createAdminClientMock } from '@/lib/supabase/testing/adminClientMock';

/**
 * Type A (#2216): ruta appen kaller rett etter innloggingen.
 *
 * Det som skjer etter innloggingen (invitasjoner, vennskap, klubber, gjest-
 * flagget) bor i `afterLogin` og testes gjennom nettsidens `verifyCode`. Her
 * sjekkes porten: hvem kalleren er kommer bare fra tokenet, og kjernen får
 * klienten som leser som kalleren.
 */

const TOKENS = {
  'token-med-epost': { id: 'user-1', email: 'Spiller@Example.com' },
  'token-uten-epost': { id: 'user-2', email: null },
};
const fake = createAdminClientMock({
  tokens: TOKENS,
  respond: (op) => {
    throw new Error(`uventet spørring: ${op.kind} ${op.table}`);
  },
});
vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => fake.client,
}));

/** Klienten med kallerens token — en markør, ikke en ekte klient. */
const CALLER_CLIENT = { marker: 'caller-client' };
const callerBuiltFrom: string[] = [];
vi.mock('@/lib/api/appAuth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/appAuth')>();
  return {
    ...actual,
    callerScopedClient: (req: Request) => {
      callerBuiltFrom.push(req.headers.get('authorization') ?? '');
      return CALLER_CLIENT;
    },
  };
});

const afterLoginMock = vi.fn();
vi.mock('@/lib/auth/afterLogin', () => ({
  afterLogin: (...args: unknown[]) => afterLoginMock(...args),
}));

const { POST } = await import('./route');

function request(authorization?: string, body?: unknown) {
  const headers: Record<string, string> = {};
  if (authorization !== undefined) headers.authorization = authorization;
  return new NextRequest('http://localhost/api/auth/after-login', {
    method: 'POST',
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  fake.reset();
  callerBuiltFrom.length = 0;
  afterLoginMock.mockResolvedValue({ landing: null });
});

describe('POST /api/auth/after-login', () => {
  it.each([
    ['uten token', undefined],
    ['med et token GoTrue ikke godtar', 'Bearer utløpt'],
    ['med et token uten e-post', 'Bearer token-uten-epost'],
  ])('%s → 401, og kjernen kalles ikke', async (_label, header) => {
    const res = await POST(request(header));

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'unauthorized' });
    expect(afterLoginMock).not.toHaveBeenCalled();
  });

  it('gyldig token → kjernen får id og e-post fra tokenet, aldri fra kroppen', async () => {
    const res = await POST(
      request('Bearer token-med-epost', { userId: 'en-annen', email: 'annen@example.com' }),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(afterLoginMock).toHaveBeenCalledTimes(1);
    expect(afterLoginMock).toHaveBeenCalledWith(CALLER_CLIENT, {
      userId: 'user-1',
      email: 'Spiller@Example.com',
    });
    expect(callerBuiltFrom).toEqual(['Bearer token-med-epost']);
  });

  it('kjernen kaster → 500 after_login_failed', async () => {
    afterLoginMock.mockRejectedValue(new Error('boom'));
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await POST(request('Bearer token-med-epost'));

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'after_login_failed' });
    spy.mockRestore();
  });
});
