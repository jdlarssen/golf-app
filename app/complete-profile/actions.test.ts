import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeRedirectMock, RedirectError } from '@/tests/serverActionMocks';

/**
 * Unit tests for the complete-profile server action. Scoped to #356: the
 * `next` round-trip that lets a game-scoped invitee land on their game after
 * finishing onboarding. The validation rules themselves are exercised through
 * the redirect codes they emit.
 */

const redirectMock = makeRedirectMock();
vi.mock('next/navigation', () => ({
  redirect: (url: string) => redirectMock(url),
}));

const getUserMock = vi.fn();
const updateEqMock = vi.fn<(...args: unknown[]) => Promise<{ error: null }>>(
  async () => ({ error: null }),
);

vi.mock('@/lib/supabase/server', () => ({
  getServerClient: async () => ({
    auth: { getUser: getUserMock },
    from: () => ({ update: () => ({ eq: updateEqMock }) }),
  }),
}));

function fd(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [k, v] of Object.entries(entries)) data.set(k, v);
  return data;
}

const VALID = {
  name: 'Kari Nordmann',
  hcp_index: '12,5',
  gender: 'mens',
  level: 'normal',
};

function lastRedirect(): string | undefined {
  return redirectMock.mock.calls.at(-1)?.[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } } });
});

describe('completeProfile — #356 next round-trip', () => {
  it('lands the user on a valid relative next after saving', async () => {
    const { completeProfile } = await import('./actions');
    await expect(
      completeProfile(fd({ ...VALID, next: '/games/abc' })),
    ).rejects.toBeInstanceOf(RedirectError);

    expect(updateEqMock).toHaveBeenCalledTimes(1);
    expect(lastRedirect()).toBe('/games/abc');
  });

  it('defaults to home when no next is supplied', async () => {
    const { completeProfile } = await import('./actions');
    await expect(completeProfile(fd(VALID))).rejects.toBeInstanceOf(
      RedirectError,
    );
    expect(lastRedirect()).toBe('/');
  });

  it('rejects an off-site next and falls back home', async () => {
    const { completeProfile } = await import('./actions');
    await expect(
      completeProfile(fd({ ...VALID, next: 'https://evil.example' })),
    ).rejects.toBeInstanceOf(RedirectError);
    expect(lastRedirect()).toBe('/');
  });

  it('preserves next across a validation error so it survives the bounce', async () => {
    const { completeProfile } = await import('./actions');
    await expect(
      completeProfile(fd({ ...VALID, name: '', next: '/games/abc' })),
    ).rejects.toBeInstanceOf(RedirectError);

    expect(updateEqMock).not.toHaveBeenCalled();
    expect(lastRedirect()).toBe(
      '/complete-profile?error=name_required&next=%2Fgames%2Fabc',
    );
  });
});
