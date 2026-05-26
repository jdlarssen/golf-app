import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Unit tests for the /login OTP rate-limit helper. Mocks the service-role
 * Supabase client so the RPC response can be steered per-case without
 * touching a real database.
 */

const rpcMock = vi.fn();

vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => ({ rpc: rpcMock }),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('consumeLoginRateLimit', () => {
  it('returns ok when both buckets allow', async () => {
    rpcMock.mockResolvedValue({ data: true, error: null });
    const { consumeLoginRateLimit } = await import('./loginRateLimit');

    const result = await consumeLoginRateLimit({
      email: 'a@example.com',
      ip: '1.2.3.4',
    });

    expect(result).toEqual({ ok: true });
    expect(rpcMock).toHaveBeenCalledTimes(2);
  });

  it('returns email reason when the email bucket is exhausted', async () => {
    rpcMock.mockImplementation(
      (_name: string, params: { p_bucket: string }) => {
        const allowed = !params.p_bucket.startsWith('login:email:');
        return Promise.resolve({ data: allowed, error: null });
      },
    );
    const { consumeLoginRateLimit } = await import('./loginRateLimit');

    const result = await consumeLoginRateLimit({
      email: 'a@example.com',
      ip: '1.2.3.4',
    });

    expect(result).toEqual({ ok: false, reason: 'email' });
  });

  it('returns ip reason when only the ip bucket is exhausted', async () => {
    rpcMock.mockImplementation(
      (_name: string, params: { p_bucket: string }) => {
        const allowed = !params.p_bucket.startsWith('login:ip:');
        return Promise.resolve({ data: allowed, error: null });
      },
    );
    const { consumeLoginRateLimit } = await import('./loginRateLimit');

    const result = await consumeLoginRateLimit({
      email: 'a@example.com',
      ip: '1.2.3.4',
    });

    expect(result).toEqual({ ok: false, reason: 'ip' });
  });

  it('lowercases the email in the bucket key so capitalised typos still count', async () => {
    rpcMock.mockResolvedValue({ data: true, error: null });
    const { consumeLoginRateLimit } = await import('./loginRateLimit');

    await consumeLoginRateLimit({
      email: 'MiXeD@Example.com',
      ip: '1.2.3.4',
    });

    const emailCall = rpcMock.mock.calls.find(
      (c) => (c[1] as { p_bucket: string }).p_bucket.startsWith('login:email:'),
    );
    expect(emailCall?.[1]).toMatchObject({
      p_bucket: 'login:email:mixed@example.com',
    });
  });

  it('passes the configured limits to the RPC', async () => {
    rpcMock.mockResolvedValue({ data: true, error: null });
    const { consumeLoginRateLimit } = await import('./loginRateLimit');

    await consumeLoginRateLimit({
      email: 'a@example.com',
      ip: '1.2.3.4',
      emailMax: 5,
      ipMax: 20,
      windowSeconds: 60,
    });

    const emailCall = rpcMock.mock.calls.find(
      (c) => (c[1] as { p_bucket: string }).p_bucket.startsWith('login:email:'),
    );
    const ipCall = rpcMock.mock.calls.find(
      (c) => (c[1] as { p_bucket: string }).p_bucket.startsWith('login:ip:'),
    );
    expect(emailCall?.[1]).toMatchObject({
      p_max: 5,
      p_window_seconds: 60,
    });
    expect(ipCall?.[1]).toMatchObject({
      p_max: 20,
      p_window_seconds: 60,
    });
  });

  it('fails open when the RPC returns an error so a DB outage does not lock everyone out', async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { message: 'connection refused' },
    });
    const { consumeLoginRateLimit } = await import('./loginRateLimit');

    const result = await consumeLoginRateLimit({
      email: 'a@example.com',
      ip: '1.2.3.4',
    });

    expect(result).toEqual({ ok: true });
  });

  it('fails open when the RPC throws', async () => {
    rpcMock.mockRejectedValue(new Error('network down'));
    const { consumeLoginRateLimit } = await import('./loginRateLimit');

    const result = await consumeLoginRateLimit({
      email: 'a@example.com',
      ip: '1.2.3.4',
    });

    expect(result).toEqual({ ok: true });
  });
});
