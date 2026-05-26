import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Unit-tester for selv-påmeldings-rate-limit-helperen. Speiler
 * loginRateLimit-test-mønsteret — mock-er service-role RPC og verifiserer
 * bucket-name-er + fail-open-oppførsel.
 */

const rpcMock = vi.fn();

vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => ({ rpc: rpcMock }),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

const USER_ID = '11111111-1111-1111-1111-111111111111';
const GAME_ID = '22222222-2222-2222-2222-222222222222';
const IP = '198.51.100.7';

describe('consumeRegistrationRateLimit', () => {
  it('returnerer ok når alle tre buckets tillater', async () => {
    rpcMock.mockResolvedValue({ data: true, error: null });
    const { consumeRegistrationRateLimit } = await import(
      './registrationRateLimit'
    );

    const result = await consumeRegistrationRateLimit({
      userId: USER_ID,
      ip: IP,
      gameId: GAME_ID,
    });

    expect(result).toEqual({ ok: true });
    expect(rpcMock).toHaveBeenCalledTimes(3);
  });

  it('blokkerer når user-bucket er utbrent', async () => {
    rpcMock.mockImplementation(
      (_name: string, params: { p_bucket: string }) => {
        const allowed = !params.p_bucket.startsWith('selfreg:user:');
        return Promise.resolve({ data: allowed, error: null });
      },
    );
    const { consumeRegistrationRateLimit } = await import(
      './registrationRateLimit'
    );

    const result = await consumeRegistrationRateLimit({
      userId: USER_ID,
      ip: IP,
      gameId: GAME_ID,
    });

    expect(result).toEqual({ ok: false, error: 'rate_limited' });
  });

  it('blokkerer når ip-bucket er utbrent', async () => {
    rpcMock.mockImplementation(
      (_name: string, params: { p_bucket: string }) => {
        const allowed = !params.p_bucket.startsWith('selfreg:ip:');
        return Promise.resolve({ data: allowed, error: null });
      },
    );
    const { consumeRegistrationRateLimit } = await import(
      './registrationRateLimit'
    );

    const result = await consumeRegistrationRateLimit({
      userId: USER_ID,
      ip: IP,
      gameId: GAME_ID,
    });

    expect(result).toEqual({ ok: false, error: 'rate_limited' });
  });

  it('blokkerer når game-bucket er utbrent', async () => {
    rpcMock.mockImplementation(
      (_name: string, params: { p_bucket: string }) => {
        const allowed = !params.p_bucket.startsWith('selfreg:game:');
        return Promise.resolve({ data: allowed, error: null });
      },
    );
    const { consumeRegistrationRateLimit } = await import(
      './registrationRateLimit'
    );

    const result = await consumeRegistrationRateLimit({
      userId: USER_ID,
      ip: IP,
      gameId: GAME_ID,
    });

    expect(result).toEqual({ ok: false, error: 'rate_limited' });
  });

  it('passerer korrekte bucket-navn og default-limits til RPC', async () => {
    rpcMock.mockResolvedValue({ data: true, error: null });
    const { consumeRegistrationRateLimit } = await import(
      './registrationRateLimit'
    );

    await consumeRegistrationRateLimit({
      userId: USER_ID,
      ip: IP,
      gameId: GAME_ID,
    });

    const userCall = rpcMock.mock.calls.find(
      (c) =>
        (c[1] as { p_bucket: string }).p_bucket === `selfreg:user:${USER_ID}`,
    );
    const ipCall = rpcMock.mock.calls.find(
      (c) => (c[1] as { p_bucket: string }).p_bucket === `selfreg:ip:${IP}`,
    );
    const gameCall = rpcMock.mock.calls.find(
      (c) =>
        (c[1] as { p_bucket: string }).p_bucket === `selfreg:game:${GAME_ID}`,
    );

    expect(userCall?.[1]).toMatchObject({
      p_max: 5,
      p_window_seconds: 24 * 60 * 60,
    });
    expect(ipCall?.[1]).toMatchObject({
      p_max: 10,
      p_window_seconds: 24 * 60 * 60,
    });
    expect(gameCall?.[1]).toMatchObject({
      p_max: 50,
      p_window_seconds: 24 * 60 * 60,
    });
  });

  it('respekterer egendefinerte limits', async () => {
    rpcMock.mockResolvedValue({ data: true, error: null });
    const { consumeRegistrationRateLimit } = await import(
      './registrationRateLimit'
    );

    await consumeRegistrationRateLimit({
      userId: USER_ID,
      ip: IP,
      gameId: GAME_ID,
      userMax: 2,
      ipMax: 3,
      gameMax: 4,
      windowSeconds: 60,
    });

    const userCall = rpcMock.mock.calls.find((c) =>
      (c[1] as { p_bucket: string }).p_bucket.startsWith('selfreg:user:'),
    );
    const ipCall = rpcMock.mock.calls.find((c) =>
      (c[1] as { p_bucket: string }).p_bucket.startsWith('selfreg:ip:'),
    );
    const gameCall = rpcMock.mock.calls.find((c) =>
      (c[1] as { p_bucket: string }).p_bucket.startsWith('selfreg:game:'),
    );

    expect(userCall?.[1]).toMatchObject({ p_max: 2, p_window_seconds: 60 });
    expect(ipCall?.[1]).toMatchObject({ p_max: 3, p_window_seconds: 60 });
    expect(gameCall?.[1]).toMatchObject({ p_max: 4, p_window_seconds: 60 });
  });

  it('failer open ved RPC-error så transient DB-utfall ikke låser flyten', async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { message: 'connection refused' },
    });
    const { consumeRegistrationRateLimit } = await import(
      './registrationRateLimit'
    );

    const result = await consumeRegistrationRateLimit({
      userId: USER_ID,
      ip: IP,
      gameId: GAME_ID,
    });

    expect(result).toEqual({ ok: true });
  });

  it('failer open når RPC kaster', async () => {
    rpcMock.mockRejectedValue(new Error('network down'));
    const { consumeRegistrationRateLimit } = await import(
      './registrationRateLimit'
    );

    const result = await consumeRegistrationRateLimit({
      userId: USER_ID,
      ip: IP,
      gameId: GAME_ID,
    });

    expect(result).toEqual({ ok: true });
  });
});
