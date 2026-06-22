import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  buildSupabaseMock,
  makeLocaleRedirectMock,
  RedirectError,
} from '@/tests/serverActionMocks';

/**
 * Unit tests for profile server-actions.
 *
 * Scoped to the trap-#2 fix in updateProfile: a 0-row UPDATE (no matching
 * users row) must redirect to error=unknown, not silently report success.
 */

const redirectMock = makeLocaleRedirectMock();
vi.mock('@/i18n/navigation', () => ({
  redirect: (arg: { href: string; locale?: string } | string) =>
    redirectMock(typeof arg === 'string' ? arg : arg.href),
}));
vi.mock('next-intl/server', () => ({
  getLocale: async () => 'no',
}));

let supabaseMock: ReturnType<typeof buildSupabaseMock>;
vi.mock('@/lib/supabase/server', () => ({
  getServerClient: async () => supabaseMock,
}));

function fd(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [k, v] of Object.entries(entries)) data.set(k, v);
  return data;
}

/** Valid form data that passes all validation gates. */
const validForm = fd({
  name: 'Ola Nordmann',
  nickname: '',
  hcp_index: '12.4',
  gender: 'mens',
  level: 'normal',
});

function lastRedirect(): string | undefined {
  const arg = redirectMock.mock.calls.at(-1)?.[0];
  if (arg === undefined) return undefined;
  return typeof arg === 'string' ? arg : arg.href;
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default: authenticated user
  supabaseMock = buildSupabaseMock([]);
  supabaseMock.auth.getUser = vi.fn(async () => ({
    data: { user: { id: 'user-1' } },
    error: null,
  }));
});

describe('updateProfile — trap #2: 0-row UPDATE treated as failure', () => {
  it('redirects to error=unknown when the UPDATE matches 0 rows', async () => {
    // Simulate PostgREST returning no rows (user not found / RLS blocked write)
    supabaseMock = buildSupabaseMock([{ data: [], error: null }]);
    supabaseMock.auth.getUser = vi.fn(async () => ({
      data: { user: { id: 'user-1' } },
      error: null,
    }));

    const { updateProfile } = await import('./actions');

    await expect(updateProfile(validForm)).rejects.toBeInstanceOf(RedirectError);

    expect(lastRedirect()).toBe('/profile?error=unknown');
  });
});
