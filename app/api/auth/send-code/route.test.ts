// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import {
  SEND_LOGIN_CODE_ERRORS,
  type SendLoginCodeError,
} from '@/lib/auth/loginCodeErrors';

/**
 * Type A (#2216): ruta appen ber om innloggingskode gjennom.
 *
 * Sperrene bor i `sendLoginCode` og har sin egen suite. Her sjekkes bare
 * ruta: at den leser kroppen trygt, sender IP-en og e-posten videre, og at hver
 * kode kjernen kan svare får sin status i WIRE. Kjernen er byttet med en spion.
 */

const sendLoginCodeMock = vi.fn();
vi.mock('@/lib/auth/sendLoginCode', () => ({
  sendLoginCode: (args: unknown) => sendLoginCodeMock(args),
}));

/** Klienten ruta henter og sender videre — en markør, ikke en ekte klient. */
const SERVER_CLIENT = { marker: 'server-client' };
vi.mock('@/lib/supabase/server', () => ({
  getServerClient: async () => SERVER_CLIENT,
}));
vi.mock('@/lib/admin/rateLimit', () => ({
  getClientIp: async () => '9.9.9.9',
}));

const { POST } = await import('./route');

function request(body: unknown, raw?: string) {
  return new NextRequest('http://localhost/api/auth/send-code', {
    method: 'POST',
    body: raw ?? JSON.stringify(body),
  });
}

/**
 * WIRE-statusen per kode. `Record` over hele unionen: en ny kode i lista får
 * ikke kompilere før den har fått en status her.
 */
const STATUS: Record<SendLoginCodeError, number> = {
  unknown: 400,
  user_not_found: 400,
  invite_expired: 400,
  disposable_email: 400,
  rate_limited: 429,
  rate_limited_minute: 429,
  rate_limited_quota: 429,
};

beforeEach(() => {
  vi.clearAllMocks();
  sendLoginCodeMock.mockResolvedValue({ ok: true });
});

describe('POST /api/auth/send-code', () => {
  it('200 { ok: true } når kjernen sendte koden, med IP-en og klienten videre', async () => {
    const res = await POST(request({ email: ' Ny@Example.TEST ' }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    // Kjernen normaliserer e-posten selv; ruta sender den som den kom.
    expect(sendLoginCodeMock).toHaveBeenCalledWith({
      supabase: SERVER_CLIENT,
      email: ' Ny@Example.TEST ',
      ip: '9.9.9.9',
    });
  });

  it.each([
    ['tom e-post', { email: '' }, undefined],
    ['bare mellomrom', { email: '   ' }, undefined],
    ['manglende e-post', {}, undefined],
    ['e-post som ikke er en streng', { email: 42 }, undefined],
    ['uleselig kropp', null, '{ikke json'],
  ])('%s → 400 unknown, og kjernen kalles ikke', async (_label, body, raw) => {
    const res = await POST(request(body, raw));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'unknown' });
    expect(sendLoginCodeMock).not.toHaveBeenCalled();
  });

  it.each([...SEND_LOGIN_CODE_ERRORS])('kjernen svarer %s → statusen i WIRE', async (code) => {
    sendLoginCodeMock.mockResolvedValue({ ok: false, code });

    const res = await POST(request({ email: 'spiller@example.com' }));

    expect(res.status).toBe(STATUS[code]);
    expect(await res.json()).toEqual({ error: code });
  });

  it('kjernen kaster → 500 unknown, uten feilteksten', async () => {
    sendLoginCodeMock.mockRejectedValue(new Error('SUPABASE_SERVICE_ROLE_KEY mangler'));
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await POST(request({ email: 'spiller@example.com' }));

    expect(res.status).toBe(500);
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({ error: 'unknown' });
    expect(text).not.toContain('SUPABASE');
    spy.mockRestore();
  });
});
