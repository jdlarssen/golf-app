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
vi.mock('next/navigation', () => ({
  redirect: (url: string) => redirectMock(url),
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
