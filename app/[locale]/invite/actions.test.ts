import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  buildSupabaseMock,
  makeRedirectMock,
  RedirectError,
} from '@/tests/serverActionMocks';

/**
 * Unit tests for the friend-invite server-action, focused on the shared
 * cross-door dedup added in #348: the friend door must consult the
 * `email_is_invited` RPC and refuse to send a second invite-mail when an
 * open invitation already exists (e.g. one created by the admin door).
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

vi.mock('@/lib/invitations/quota', () => ({
  getQuotaState: vi.fn(async () => ({ isExhausted: false })),
}));

function lastRedirect(): string | undefined {
  return redirectMock.mock.calls.at(-1)?.[0];
}

function fd(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [k, v] of Object.entries(entries)) data.set(k, v);
  return data;
}

const COMPLETED_PROFILE = {
  data: { name: 'Tester', profile_completed_at: '2026-01-01T00:00:00Z' },
  error: null,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('sendFriendInvite — shared dedup (#348)', () => {
  it('refuses a second mail when email_is_invited is true: redirect already_invited, no insert, no mail', async () => {
    supabaseMock = buildSupabaseMock([COMPLETED_PROFILE], {
      email_is_registered: false,
      email_is_in_auth_users: false,
      email_is_invited: true,
    });
    supabaseMock.auth.getUser.mockResolvedValue({
      data: { user: { id: 'u1' } },
    });
    const { sendFriendInvite } = await import('./actions');

    await expect(
      sendFriendInvite(fd({ email: 'Taken@Example.com' })),
    ).rejects.toBeInstanceOf(RedirectError);

    expect(lastRedirect()).toBe('/profile?invite_error=already_invited');
    // RPC called with the normalized (lowercased) email.
    expect(supabaseMock.rpc).toHaveBeenCalledWith('email_is_invited', {
      check_email: 'taken@example.com',
    });
    // No second invitation row, no second invite-mail.
    const insertCalls = supabaseMock.__fromCalls.filter(
      (c) => c.method === 'insert',
    );
    expect(insertCalls).toHaveLength(0);
    expect(sendInviteNotificationMock).not.toHaveBeenCalled();
  });

  it('rejects a known disposable domain: redirect disposable_email, no Supabase work, no mail (#422)', async () => {
    supabaseMock = buildSupabaseMock([], {});
    supabaseMock.auth.getUser.mockResolvedValue({
      data: { user: { id: 'u1' } },
    });
    const { sendFriendInvite } = await import('./actions');

    await expect(
      sendFriendInvite(fd({ email: 'throwaway@mailinator.com' })),
    ).rejects.toBeInstanceOf(RedirectError);

    expect(lastRedirect()).toBe('/profile?invite_error=disposable_email');
    // Short-circuits before any DB lookup/insert and before the mail.
    expect(supabaseMock.rpc).not.toHaveBeenCalled();
    const insertCalls = supabaseMock.__fromCalls.filter(
      (c) => c.method === 'insert',
    );
    expect(insertCalls).toHaveLength(0);
    expect(sendInviteNotificationMock).not.toHaveBeenCalled();
  });

  it('proceeds normally when the address has no open invitation: inserts + sends mail', async () => {
    supabaseMock = buildSupabaseMock(
      [COMPLETED_PROFILE, { error: null }],
      {
        email_is_registered: false,
        email_is_in_auth_users: false,
        email_is_invited: false,
      },
    );
    supabaseMock.auth.getUser.mockResolvedValue({
      data: { user: { id: 'u1' } },
    });
    const { sendFriendInvite } = await import('./actions');

    await expect(
      sendFriendInvite(fd({ email: 'new@example.com' })),
    ).rejects.toBeInstanceOf(RedirectError);

    expect(lastRedirect()).toBe(
      '/profile?invite=sent&invite_email=new%40example.com',
    );
    const insertCalls = supabaseMock.__fromCalls.filter(
      (c) => c.method === 'insert',
    );
    expect(insertCalls).toHaveLength(1);
    expect(sendInviteNotificationMock).toHaveBeenCalledWith({
      to: 'new@example.com',
      invitedByName: 'Tester',
    });
  });
});
