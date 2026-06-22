import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  buildSupabaseMock,
  makeRedirectMock,
  RedirectError,
} from '@/tests/serverActionMocks';

/**
 * Unit tests for the shared admin-gate helper `requireAdmin` in
 * `lib/admin/auth.ts`. There are two roles: admin (`users.is_admin`) or
 * player (everyone else). `loadRole`:
 *   1. `auth.getUser()` — redirects to /login when no session.
 *   2. `users.select('is_admin, email, name').eq.single` — feeds the role
 *      flag + display name to the AdminRoleContext.
 * Tests focus on the redirect paths and the returned context shape.
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
    });
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it('redirects a non-admin caller to /', async () => {
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
    // loadRole derives email from profile.email ?? user.email. A non-admin
    // still redirects to /, but this exercises the null-profile-email path
    // without crashing.
    supabaseMock = buildSupabaseMock([
      { data: { is_admin: false, email: null, name: null }, error: null },
    ]);
    setUser('user-uuid-2', randomEmail);

    const { requireAdmin } = await import('./auth');
    await expect(requireAdmin(supabaseMock as never)).rejects.toBeInstanceOf(
      RedirectError,
    );
    expect(lastRedirect()).toBe('/');
  });
});
