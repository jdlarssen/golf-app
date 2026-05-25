import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  buildSupabaseMock,
  makeRedirectMock,
  RedirectError,
} from '@/tests/serverActionMocks';

/**
 * Unit tests for the shared admin-gate helpers in `lib/admin/auth.ts`.
 *
 * Both `requireAdmin` and `requireAdminOrTrustedCreator` follow the same
 * internal `loadRole` path:
 *   1. `auth.getUser()` — redirects to /login when no session.
 *   2. `users.select('is_admin, email, name').eq.single` — feeds the role
 *      flags + display name to the AdminRoleContext.
 *
 * The trust-flag is derived from the user's email via `isTrustedCreator`,
 * which is unit-tested separately in `trustedCreators.test.ts`. Tests here
 * focus on the redirect-paths and the returned context shape.
 */

const redirectMock = makeRedirectMock();
vi.mock('next/navigation', () => ({
  redirect: (url: string) => redirectMock(url),
}));

let supabaseMock: ReturnType<typeof buildSupabaseMock>;
vi.mock('@/lib/supabase/server', () => ({
  getServerClient: async () => supabaseMock,
}));

function lastRedirect(): string | undefined {
  return redirectMock.mock.calls.at(-1)?.[0];
}

const adminUserId = 'admin-uuid-1';
const trustedEmail = 'fornes.even@yahoo.no';
const randomEmail = 'random@example.com';

function setUser(id: string | null, email: string | null = null) {
  supabaseMock.auth.getUser = vi.fn(async () => ({
    data: { user: id ? { id, email } : null },
    error: null,
  }));
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('requireAdmin', () => {
  it('returns the context unchanged for an admin caller', async () => {
    supabaseMock = buildSupabaseMock([
      {
        data: { is_admin: true, email: randomEmail, name: 'Jørgen' },
        error: null,
      },
    ]);
    setUser(adminUserId, randomEmail);

    const { requireAdmin } = await import('./auth');
    const ctx = await requireAdmin(supabaseMock as never);

    expect(ctx).toEqual({
      userId: adminUserId,
      email: randomEmail,
      name: 'Jørgen',
      isAdmin: true,
      isTrusted: false,
    });
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it('redirects trusted-non-admin to /admin so they stay in Sekretariatet', async () => {
    supabaseMock = buildSupabaseMock([
      {
        data: { is_admin: false, email: trustedEmail, name: 'Even' },
        error: null,
      },
    ]);
    setUser('trusted-uuid-1', trustedEmail);

    const { requireAdmin } = await import('./auth');
    await expect(requireAdmin(supabaseMock as never)).rejects.toBeInstanceOf(
      RedirectError,
    );
    expect(lastRedirect()).toBe('/admin');
  });

  it('redirects ikke-trusted-ikke-admin to /', async () => {
    supabaseMock = buildSupabaseMock([
      {
        data: { is_admin: false, email: randomEmail, name: 'Per' },
        error: null,
      },
    ]);
    setUser('random-uuid-1', randomEmail);

    const { requireAdmin } = await import('./auth');
    await expect(requireAdmin(supabaseMock as never)).rejects.toBeInstanceOf(
      RedirectError,
    );
    expect(lastRedirect()).toBe('/');
  });

  it('redirects unauthenticated caller to /login (no DB query)', async () => {
    supabaseMock = buildSupabaseMock([]);
    setUser(null);

    const { requireAdmin } = await import('./auth');
    await expect(requireAdmin(supabaseMock as never)).rejects.toBeInstanceOf(
      RedirectError,
    );
    expect(lastRedirect()).toBe('/login');
    expect(supabaseMock.from).not.toHaveBeenCalled();
  });

  it('falls back to user.email when the profile-row has no email column', async () => {
    // Defence-in-depth: if the users-row select returns null/undefined email
    // (e.g. a pending-invitee placeholder where the column was nulled), the
    // helper still derives `isTrusted` from the auth user's email.
    supabaseMock = buildSupabaseMock([
      { data: { is_admin: false, email: null, name: null }, error: null },
    ]);
    setUser('trusted-uuid-2', trustedEmail);

    const { requireAdmin } = await import('./auth');
    // Trusted (email read from user.email) → /admin redirect.
    await expect(requireAdmin(supabaseMock as never)).rejects.toBeInstanceOf(
      RedirectError,
    );
    expect(lastRedirect()).toBe('/admin');
  });
});

describe('requireAdminOrTrustedCreator', () => {
  it('returns the context unchanged for an admin caller', async () => {
    supabaseMock = buildSupabaseMock([
      {
        data: { is_admin: true, email: randomEmail, name: 'Jørgen' },
        error: null,
      },
    ]);
    setUser(adminUserId, randomEmail);

    const { requireAdminOrTrustedCreator } = await import('./auth');
    const ctx = await requireAdminOrTrustedCreator(supabaseMock as never);

    expect(ctx.isAdmin).toBe(true);
    expect(ctx.isTrusted).toBe(false);
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it('returns the context unchanged for a trusted-non-admin caller', async () => {
    supabaseMock = buildSupabaseMock([
      {
        data: { is_admin: false, email: trustedEmail, name: 'Even' },
        error: null,
      },
    ]);
    setUser('trusted-uuid-3', trustedEmail);

    const { requireAdminOrTrustedCreator } = await import('./auth');
    const ctx = await requireAdminOrTrustedCreator(supabaseMock as never);

    expect(ctx.isAdmin).toBe(false);
    expect(ctx.isTrusted).toBe(true);
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it('redirects ikke-trusted-ikke-admin to /', async () => {
    supabaseMock = buildSupabaseMock([
      {
        data: { is_admin: false, email: randomEmail, name: 'Per' },
        error: null,
      },
    ]);
    setUser('random-uuid-2', randomEmail);

    const { requireAdminOrTrustedCreator } = await import('./auth');
    await expect(
      requireAdminOrTrustedCreator(supabaseMock as never),
    ).rejects.toBeInstanceOf(RedirectError);
    expect(lastRedirect()).toBe('/');
  });

  it('redirects unauthenticated caller to /login (no DB query)', async () => {
    supabaseMock = buildSupabaseMock([]);
    setUser(null);

    const { requireAdminOrTrustedCreator } = await import('./auth');
    await expect(
      requireAdminOrTrustedCreator(supabaseMock as never),
    ).rejects.toBeInstanceOf(RedirectError);
    expect(lastRedirect()).toBe('/login');
    expect(supabaseMock.from).not.toHaveBeenCalled();
  });
});
