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

// Admin client should never be touched on a honeypot hit.
const adminUpdateMock = vi.fn();
vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => ({
    from: () => ({
      update: adminUpdateMock,
    }),
  }),
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
  supabaseMock = buildSupabaseMock([]);
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
});
