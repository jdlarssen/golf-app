import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Unit tests for the admin-invite rate-limit helper. Mocks the service-role
 * Supabase client (getAdminClient) so the RPC response can be steered
 * per-bucket without touching a real database — the limiter routes through
 * service-role (#1131) like the login/self-reg limiters.
 */

const rpcMock = vi.fn();

vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => ({ rpc: rpcMock }),
}));

type RpcParams = { p_bucket: string; p_max: number; p_window_seconds: number };

beforeEach(() => {
  vi.clearAllMocks();
});

describe('consumeAdminInviteRateLimit', () => {
  it('checks both buckets in parallel and allows when both pass', async () => {
    rpcMock.mockResolvedValue({ data: true, error: null });
    const { consumeAdminInviteRateLimit } = await import('./rateLimit');

    const allowed = await consumeAdminInviteRateLimit({
      adminId: 'a1',
      ip: '1.2.3.4',
    });

    expect(allowed).toBe(true);
    expect(rpcMock).toHaveBeenCalledTimes(2);
    const buckets = rpcMock.mock.calls
      .map((c) => (c[1] as RpcParams).p_bucket)
      .sort();
    expect(buckets).toEqual(['invite-admin:a1', 'invite-ip:1.2.3.4']);
  });

  it('blocks when admin bucket is exhausted', async () => {
    rpcMock.mockImplementation((_name: string, params: RpcParams) =>
      Promise.resolve({
        data: !params.p_bucket.startsWith('invite-admin:'),
        error: null,
      }),
    );
    const { consumeAdminInviteRateLimit } = await import('./rateLimit');

    const allowed = await consumeAdminInviteRateLimit({
      adminId: 'a1',
      ip: '1.2.3.4',
    });

    expect(allowed).toBe(false);
  });

  it('blocks when IP bucket is exhausted', async () => {
    rpcMock.mockImplementation((_name: string, params: RpcParams) =>
      Promise.resolve({
        data: !params.p_bucket.startsWith('invite-ip:'),
        error: null,
      }),
    );
    const { consumeAdminInviteRateLimit } = await import('./rateLimit');

    const allowed = await consumeAdminInviteRateLimit({
      adminId: 'a1',
      ip: '1.2.3.4',
    });

    expect(allowed).toBe(false);
  });

  it('fails open when the RPC returns an error', async () => {
    rpcMock.mockImplementation((_name: string, params: RpcParams) =>
      Promise.resolve(
        params.p_bucket.startsWith('invite-admin:')
          ? { data: null, error: { message: 'db down' } }
          : { data: true, error: null },
      ),
    );
    const { consumeAdminInviteRateLimit } = await import('./rateLimit');

    const allowed = await consumeAdminInviteRateLimit({
      adminId: 'a1',
      ip: '1.2.3.4',
    });

    expect(allowed).toBe(true);
  });

  it('honours custom limits and window', async () => {
    rpcMock.mockResolvedValue({ data: true, error: null });
    const { consumeAdminInviteRateLimit } = await import('./rateLimit');

    await consumeAdminInviteRateLimit({
      adminId: 'a1',
      ip: '1.2.3.4',
      adminMax: 5,
      ipMax: 10,
      windowSeconds: 300,
    });

    const adminCall = rpcMock.mock.calls.find((c) =>
      (c[1] as RpcParams).p_bucket.startsWith('invite-admin:'),
    );
    const ipCall = rpcMock.mock.calls.find((c) =>
      (c[1] as RpcParams).p_bucket.startsWith('invite-ip:'),
    );
    expect(adminCall?.[1]).toMatchObject({ p_max: 5, p_window_seconds: 300 });
    expect(ipCall?.[1]).toMatchObject({ p_max: 10, p_window_seconds: 300 });
  });
});
