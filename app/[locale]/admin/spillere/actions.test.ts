import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  buildSupabaseMock,
  makeRedirectMock,
  RedirectError,
} from '@/tests/serverActionMocks';

/**
 * Unit tests for the admin invitation server-actions. Currently scoped to
 * the honeypot silent-reject path on `sendInvitation` — adding the test
 * infrastructure here so future admin-invite coverage can extend it.
 *
 * Honeypot semantics: when the hidden `website` field is populated, the
 * action MUST NOT touch `invitations` (no insert) nor send a Resend mail.
 * It still redirects with the success status so a bot can't probe the
 * difference.
 */

const redirectMock = makeRedirectMock();
vi.mock('@/i18n/navigation', () => ({
  redirect: (arg: { href: string; locale?: string } | string) =>
    redirectMock(typeof arg === 'string' ? arg : arg.href),
}));
// lib/admin/auth.ts (shared auth gate) still redirects via next/navigation —
// route it to the same spy so auth-gate assertions hold.
vi.mock('next/navigation', () => ({
  redirect: (url: string) => redirectMock(url),
}));
vi.mock('next-intl/server', () => ({
  getLocale: async () => 'no',
}));

let supabaseMock: ReturnType<typeof buildSupabaseMock>;
vi.mock('@/lib/supabase/server', () => ({
  getServerClient: async () => supabaseMock,
}));

const sendInviteNotificationMock = vi.fn();
vi.mock('@/lib/mail/inviteNotification', () => ({
  sendInviteNotification: (...args: unknown[]) =>
    sendInviteNotificationMock(...args),
}));

const adminClientMock = vi.fn();
vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => adminClientMock(),
}));

vi.mock('@/lib/admin/rateLimit', () => ({
  consumeAdminInviteRateLimit: vi.fn(async () => true),
  getClientIp: vi.fn(async () => '127.0.0.1'),
}));

vi.mock('@/lib/admin/auth', () => ({
  requireAdmin: vi.fn(async () => ({ userId: 'admin-1', name: 'Admin' })),
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

describe('sendInvitation — honeypot', () => {
  it('silent-rejects when the website field is populated: no invitations.insert, no Resend mail', async () => {
    const { sendInvitation } = await import('./actions');

    await expect(
      sendInvitation(
        fd({
          email: 'bot@example.com',
          website: 'https://spam.example.com', // bot tripped the trap
        }),
      ),
    ).rejects.toBeInstanceOf(RedirectError);

    // Bot sees a "sent" status — same shape as the happy path.
    expect(lastRedirect()).toBe(
      '/admin/spillere?status=sent&email=bot%40example.com',
    );

    // Critical: no DB write, no mail, no auth lookup.
    expect(supabaseMock.from).not.toHaveBeenCalled();
    expect(supabaseMock.auth.getUser).not.toHaveBeenCalled();
    expect(sendInviteNotificationMock).not.toHaveBeenCalled();
    expect(adminClientMock).not.toHaveBeenCalled();
  });
});

describe('sendInvitation — shared dedup (#348)', () => {
  it('redirects already_invited via the email_is_invited RPC: no insert, no mail', async () => {
    // The cross-door dedup must use the shared SECURITY DEFINER RPC, not a
    // direct invitations query — so it sees a friend-invite created by
    // another user too (RLS 0020 would hide that row from a table query).
    supabaseMock = buildSupabaseMock([], { email_is_invited: true });
    const { sendInvitation } = await import('./actions');

    await expect(
      sendInvitation(fd({ email: 'Taken@Example.com' })),
    ).rejects.toBeInstanceOf(RedirectError);

    expect(lastRedirect()).toBe(
      '/admin/spillere?error=already_invited&email=taken%40example.com',
    );
    // RPC called with the normalized (lowercased) email.
    expect(supabaseMock.rpc).toHaveBeenCalledWith('email_is_invited', {
      check_email: 'taken@example.com',
    });
    // No second invitation row, no second mail.
    const insertCalls = supabaseMock.__fromCalls.filter(
      (c) => c.method === 'insert',
    );
    expect(insertCalls).toHaveLength(0);
    expect(sendInviteNotificationMock).not.toHaveBeenCalled();
  });
});
