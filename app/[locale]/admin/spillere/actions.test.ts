import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  buildSupabaseMock,
  makeRedirectMock,
  RedirectError,
} from '@/tests/serverActionMocks';
import { INVITE_TTL_DAYS } from '@/lib/auth/inviteExpiry';

/**
 * Unit tests for the admin invitation server-actions: the honeypot
 * silent-reject on `sendInvitation`, the shared dedup RPC, and the
 * deadline-extension `resendInvitation` performs (#1381).
 *
 * Honeypot semantics: when the hidden `website` field is populated, the
 * action MUST NOT touch `invitations` (no insert) nor send a Resend mail.
 * It still redirects with the success status so a bot can't probe the
 * difference.
 */

const TTL_MS = INVITE_TTL_DAYS * 24 * 60 * 60 * 1000;

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

describe('resendInvitation — the deadline follows the mail (#1381)', () => {
  const pendingRow = {
    data: { email: 'sen@example.com', accepted_at: null, token: 'tok-1' },
    error: null,
  };

  it('pushes expires_at a full TTL out and mails that new deadline', async () => {
    supabaseMock = buildSupabaseMock([
      pendingRow,
      { data: [{ id: 'inv-1' }], error: null }, // UPDATE ... .select('id')
    ]);
    const { resendInvitation } = await import('./actions');

    const before = Date.now();
    await expect(
      resendInvitation(fd({ id: 'inv-1' })),
    ).rejects.toBeInstanceOf(RedirectError);
    const after = Date.now();

    const update = supabaseMock.__fromCalls.find((c) => c.method === 'update');
    expect(update?.table).toBe('invitations');
    const patch = (update?.args[0] ?? {}) as { expires_at?: string };
    const stamped = Date.parse(patch.expires_at ?? '');
    // A fresh 7-day window from now — not the row's old (possibly passed) stamp.
    expect(stamped).toBeGreaterThanOrEqual(before + TTL_MS);
    expect(stamped).toBeLessThanOrEqual(after + TTL_MS);

    // Scoped to this row AND still-unaccepted (race-safe).
    expect(supabaseMock.__fromCalls).toContainEqual(
      expect.objectContaining({ method: 'eq', args: ['id', 'inv-1'] }),
    );
    expect(supabaseMock.__fromCalls).toContainEqual(
      expect.objectContaining({ method: 'is', args: ['accepted_at', null] }),
    );

    // The mail must carry the NEW deadline, or its date line lies.
    expect(sendInviteNotificationMock).toHaveBeenCalledWith({
      to: 'sen@example.com',
      invitedByName: 'Admin',
      inviteToken: 'tok-1',
      expiresAt: patch.expires_at,
    });
    expect(lastRedirect()).toBe(
      '/admin/spillere?status=resent&email=sen%40example.com',
    );
  });

  it('0-row UPDATE redirects resend_failed and sends no mail', async () => {
    // Row deleted (or accepted) between the read and the write: PostgREST
    // reports no error, so only the affected-row assertion catches it.
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    supabaseMock = buildSupabaseMock([pendingRow, { data: [], error: null }]);
    const { resendInvitation } = await import('./actions');

    await expect(
      resendInvitation(fd({ id: 'inv-1' })),
    ).rejects.toBeInstanceOf(RedirectError);

    expect(lastRedirect()).toBe('/admin/spillere?error=resend_failed');
    expect(sendInviteNotificationMock).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('an accepted invitation is refused before any write', async () => {
    supabaseMock = buildSupabaseMock([
      {
        data: {
          email: 'joined@example.com',
          accepted_at: '2026-08-01T10:00:00.000Z',
          token: 'tok-2',
        },
        error: null,
      },
    ]);
    const { resendInvitation } = await import('./actions');

    await expect(
      resendInvitation(fd({ id: 'inv-2' })),
    ).rejects.toBeInstanceOf(RedirectError);

    expect(lastRedirect()).toBe('/admin/spillere?error=resend_failed');
    expect(
      supabaseMock.__fromCalls.filter((c) => c.method === 'update'),
    ).toHaveLength(0);
    expect(sendInviteNotificationMock).not.toHaveBeenCalled();
  });
});
