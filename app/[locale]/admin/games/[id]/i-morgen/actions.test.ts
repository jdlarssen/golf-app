import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeLocaleRedirectMock, RedirectError } from '@/tests/serverActionMocks';

/**
 * #2483: «Purr Kari» on «Klar for i morgen?». The action is the gate and the
 * redirect; who may be reminded lives in the core
 * (`lib/games/remindUnconfirmed.ts`, own suite), mocked here at its edge.
 * `requireAdminOrCreator` is mocked too (its own suite covers who passes);
 * here: that the gate runs first, and that a refusal never reaches the core.
 */

const redirectMock = makeLocaleRedirectMock();
vi.mock('@/i18n/navigation', () => ({
  redirect: (arg: { href: string; locale?: string } | string) => redirectMock(arg),
}));
vi.mock('next-intl/server', () => ({ getLocale: async () => 'no' }));
const revalidatePathMock = vi.fn();
vi.mock('@/lib/i18n/revalidateLocalePath', () => ({
  revalidatePath: (...args: unknown[]) => revalidatePathMock(...args),
}));
vi.mock('@/lib/supabase/server', () => ({ getServerClient: async () => ({}) }));
const gateMock = vi.fn(async (..._args: unknown[]) => ({ userId: 'org', isAdmin: false }));
vi.mock('@/lib/admin/auth', () => ({
  requireAdminOrCreator: (...args: unknown[]) => gateMock(...args),
}));
const sendMock = vi.fn();
vi.mock('@/lib/games/remindUnconfirmed', () => ({
  sendUnconfirmedReminders: (...args: unknown[]) => sendMock(...args),
}));

import { remindUnansweredPlayer } from './actions';

async function landing(userId = 'kari'): Promise<string> {
  try {
    await remindUnansweredPlayer('spill-1', userId);
  } catch (e) {
    if (e instanceof RedirectError) return e.url;
    throw e;
  }
  throw new Error('the action did not redirect');
}

beforeEach(() => {
  vi.clearAllMocks();
  gateMock.mockImplementation(async () => ({ userId: 'org', isAdmin: false }));
});

describe('remindUnansweredPlayer', () => {
  it('a signed-in player who is neither organiser nor admin is sent away before anything is sent', async () => {
    gateMock.mockImplementation(async () => {
      throw new RedirectError('/');
    });
    expect(await landing()).toBe('/');
    expect(gateMock).toHaveBeenCalledWith(expect.anything(), 'spill-1');
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('the organiser without admin reminds that one player and lands on «Purret»', async () => {
    sendMock.mockResolvedValue({ ok: true, reminded: 1 });
    expect(await landing()).toBe('/admin/games/spill-1/i-morgen?purret=kari');
    expect(sendMock).toHaveBeenCalledWith('spill-1', { userIds: ['kari'] });
    expect(revalidatePathMock).toHaveBeenCalledWith('/admin/games/spill-1/i-morgen');
  });

  it('a user id the core will not remind lands on «Fant ingen å purre»', async () => {
    sendMock.mockResolvedValue({ ok: true, reminded: 0 });
    expect(await landing('fremmed')).toBe('/admin/games/spill-1/i-morgen?error=notRemindable');
  });

  it.each(['not_active', 'not_found'])('a round the core refuses (%s) goes back to the game', async (reason) => {
    sendMock.mockResolvedValue({ ok: false, reason });
    expect(await landing()).toBe('/games/spill-1');
  });
});
