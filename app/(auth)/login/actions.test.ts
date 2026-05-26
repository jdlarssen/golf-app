import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  buildSupabaseMock,
  makeRedirectMock,
  RedirectError,
} from '@/tests/serverActionMocks';

/**
 * Unit tests for the /login server actions. Currently scoped to the
 * honeypot silent-reject path on `sendCode` — adding the test infrastructure
 * here so future login coverage can extend it.
 *
 * Honeypot semantics: a populated `website` field means a bot. The action
 * must NOT call Supabase signInWithOtp or the email_is_invited RPC, but
 * must still redirect to the verify step so the bot can't distinguish a
 * silent-reject from a real send.
 */

const redirectMock = makeRedirectMock();
vi.mock('next/navigation', () => ({
  redirect: (url: string) => redirectMock(url),
}));

let supabaseMock: ReturnType<typeof buildSupabaseMock>;
const rpcMock = vi.fn();
const signInWithOtpMock = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  getServerClient: async () => ({
    ...supabaseMock,
    rpc: rpcMock,
    auth: {
      ...supabaseMock.auth,
      signInWithOtp: signInWithOtpMock,
    },
  }),
}));

// Admin client mock. Used by two callers in actions.ts:
// 1. The `opened_at`-stamping side-effect:
//      .from('invitations').update({...}).ilike(...).is(...).is(...)
//    The .is() chain terminates by being awaited — supabase-js resolves the
//    builder when treated as a thenable.
// 2. The login rate-limit helper (which calls .rpc). Those tests live in
//    lib/auth/loginRateLimit.test.ts; here we mock the helper itself
//    (consumeLoginRateLimitMock below), so the rpc reachable through this
//    mock only needs to exist for type-safety.
const adminUpdateMock = vi.fn();
function makeAdminBuilder() {
  const builder: Record<string, unknown> = {};
  for (const m of ['ilike', 'is', 'eq', 'select']) {
    builder[m] = () => builder;
  }
  // Awaitable terminal — what supabase-js does when an update chain is awaited.
  (builder as { then: unknown }).then = (
    resolve: (value: { data: null; error: null }) => void,
  ) => resolve({ data: null, error: null });
  return builder;
}
vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => ({
    from: () => ({
      update: (...args: unknown[]) => {
        adminUpdateMock(...args);
        return makeAdminBuilder();
      },
    }),
    rpc: () => Promise.resolve({ data: true, error: null }),
  }),
}));

// loginRateLimit is mocked so tests can deterministically allow/deny without
// the admin RPC machinery. Default to ok; override per-test where needed.
const consumeLoginRateLimitMock = vi.fn();
vi.mock('@/lib/auth/loginRateLimit', () => ({
  consumeLoginRateLimit: (
    opts: Parameters<typeof consumeLoginRateLimitMock>[0],
  ) => consumeLoginRateLimitMock(opts),
}));

vi.mock('@/lib/admin/rateLimit', () => ({
  getClientIp: async () => '1.2.3.4',
}));

function lastRedirect(): string | undefined {
  return redirectMock.mock.calls.at(-1)?.[0];
}

function fd(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [k, v] of Object.entries(entries)) data.set(k, v);
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  supabaseMock = buildSupabaseMock([]);
  // Default: rate-limit allows; tests that exercise the deny path override.
  consumeLoginRateLimitMock.mockResolvedValue({ ok: true });
});

describe('sendCode — honeypot', () => {
  it('silent-rejects when the website field is populated: no signInWithOtp call, redirects to verify step', async () => {
    const { sendCode } = await import('./actions');

    await expect(
      sendCode(
        fd({
          email: 'bot@example.com',
          website: 'https://spam.example.com', // bot filled the trap
        }),
      ),
    ).rejects.toBeInstanceOf(RedirectError);

    // Bot sees a "success" response — verify step, no error code.
    expect(lastRedirect()).toBe(
      '/login?step=verify&email=bot%40example.com',
    );

    // Critical: no Supabase work happened.
    expect(rpcMock).not.toHaveBeenCalled();
    expect(signInWithOtpMock).not.toHaveBeenCalled();
    expect(adminUpdateMock).not.toHaveBeenCalled();
  });

  it('proceeds normally when website is empty (happy path reaches Supabase)', async () => {
    rpcMock.mockResolvedValue({ data: false, error: null });
    signInWithOtpMock.mockResolvedValue({ error: null });

    const { sendCode } = await import('./actions');

    await expect(
      sendCode(
        fd({
          email: 'real@example.com',
          website: '', // empty — real user
        }),
      ),
    ).rejects.toBeInstanceOf(RedirectError);

    // Empty honeypot → the action calls Supabase and the email_is_invited RPC.
    expect(rpcMock).toHaveBeenCalledWith('email_is_invited', {
      check_email: 'real@example.com',
    });
    expect(signInWithOtpMock).toHaveBeenCalledTimes(1);
    expect(lastRedirect()).toBe(
      '/login?step=verify&email=real%40example.com',
    );
  });

  it('skips the rate-limit RPC when honeypot fires (cheap short-circuit)', async () => {
    const { sendCode } = await import('./actions');

    await expect(
      sendCode(
        fd({
          email: 'bot@example.com',
          website: 'https://spam.example.com',
        }),
      ),
    ).rejects.toBeInstanceOf(RedirectError);

    expect(consumeLoginRateLimitMock).not.toHaveBeenCalled();
  });
});

describe('sendCode — self-registration flag', () => {
  it('passes shouldCreateUser=false for a non-invited email when the flag is off', async () => {
    vi.stubEnv('NEXT_PUBLIC_ALLOW_SELF_REGISTRATION', 'false');
    rpcMock.mockResolvedValue({ data: false, error: null });
    signInWithOtpMock.mockResolvedValue({ error: null });

    const { sendCode } = await import('./actions');

    await expect(
      sendCode(fd({ email: 'newcomer@example.com' })),
    ).rejects.toBeInstanceOf(RedirectError);

    expect(signInWithOtpMock).toHaveBeenCalledWith({
      email: 'newcomer@example.com',
      options: { shouldCreateUser: false },
    });
  });

  it('passes shouldCreateUser=true for a non-invited email when the flag is on', async () => {
    vi.stubEnv('NEXT_PUBLIC_ALLOW_SELF_REGISTRATION', 'true');
    rpcMock.mockResolvedValue({ data: false, error: null });
    signInWithOtpMock.mockResolvedValue({ error: null });

    const { sendCode } = await import('./actions');

    await expect(
      sendCode(fd({ email: 'newcomer@example.com' })),
    ).rejects.toBeInstanceOf(RedirectError);

    expect(signInWithOtpMock).toHaveBeenCalledWith({
      email: 'newcomer@example.com',
      options: { shouldCreateUser: true },
    });
  });

  it('keeps shouldCreateUser=true for an invited email regardless of flag', async () => {
    vi.stubEnv('NEXT_PUBLIC_ALLOW_SELF_REGISTRATION', 'false');
    rpcMock.mockResolvedValue({ data: true, error: null });
    signInWithOtpMock.mockResolvedValue({ error: null });

    const { sendCode } = await import('./actions');

    await expect(
      sendCode(fd({ email: 'invited@example.com' })),
    ).rejects.toBeInstanceOf(RedirectError);

    expect(signInWithOtpMock).toHaveBeenCalledWith({
      email: 'invited@example.com',
      options: { shouldCreateUser: true },
    });
  });
});

describe('sendCode — rate-limit', () => {
  it('redirects with rate_limited when consumeLoginRateLimit denies (email bucket)', async () => {
    consumeLoginRateLimitMock.mockResolvedValue({ ok: false, reason: 'email' });

    const { sendCode } = await import('./actions');

    await expect(
      sendCode(fd({ email: 'spam@example.com' })),
    ).rejects.toBeInstanceOf(RedirectError);

    expect(lastRedirect()).toBe('/login?error=rate_limited');
    // Critical: Supabase OTP is NOT called when rate-limit denies.
    expect(signInWithOtpMock).not.toHaveBeenCalled();
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('redirects with rate_limited (same error) when IP bucket denies — no leak of which bucket hit', async () => {
    consumeLoginRateLimitMock.mockResolvedValue({ ok: false, reason: 'ip' });

    const { sendCode } = await import('./actions');

    await expect(
      sendCode(fd({ email: 'anyone@example.com' })),
    ).rejects.toBeInstanceOf(RedirectError);

    expect(lastRedirect()).toBe('/login?error=rate_limited');
  });

  it('calls consumeLoginRateLimit with the trimmed/lowercased email and resolved IP', async () => {
    rpcMock.mockResolvedValue({ data: false, error: null });
    signInWithOtpMock.mockResolvedValue({ error: null });

    const { sendCode } = await import('./actions');

    await expect(
      sendCode(fd({ email: '  Spammer@Example.com  ' })),
    ).rejects.toBeInstanceOf(RedirectError);

    expect(consumeLoginRateLimitMock).toHaveBeenCalledWith({
      email: 'spammer@example.com',
      ip: '1.2.3.4',
    });
  });
});
