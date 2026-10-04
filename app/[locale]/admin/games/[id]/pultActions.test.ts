import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeLocaleRedirectMock, RedirectError } from '@/tests/serverActionMocks';

/**
 * #2268 (the owner's choice B): the desk's «Påminn» on a skipped-hole row.
 * The action is the gate and the redirect; the rule lives in the core
 * (`lib/games/remindMissingScore.ts`, own suite), mocked here at its edge.
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
const requireAdminMock = vi.fn(async () => {});
vi.mock('@/lib/admin/auth', () => ({ requireAdmin: () => requireAdminMock() }));
const sendMock = vi.fn();
vi.mock('@/lib/games/remindMissingScore', () => ({
  sendMissingScoreReminders: (...args: unknown[]) => sendMock(...args),
}));

import { remindMissingScore } from './pultActions';

/** Run the action and return where it redirected. */
async function landing(): Promise<string> {
  try {
    await remindMissingScore('spill-1', ['tore']);
  } catch (e) {
    if (e instanceof RedirectError) return e.url;
    throw e;
  }
  throw new Error('the action did not redirect');
}

beforeEach(() => {
  vi.clearAllMocks();
  requireAdminMock.mockImplementation(async () => {});
});

describe('remindMissingScore', () => {
  it('stops at the gate: a non-admin never reaches the core', async () => {
    requireAdminMock.mockImplementation(async () => {
      throw new RedirectError('/');
    });
    expect(await landing()).toBe('/');
    expect(sendMock).not.toHaveBeenCalled();
  });

  it.each([
    [{ ok: false, reason: 'no_gap' }, '/admin/games/spill-1?error=hole_reminder_stale'],
    [{ ok: false, reason: 'only_guests' }, '/admin/games/spill-1?error=hole_reminder_guests'],
    [{ ok: false, reason: 'not_active' }, '/admin/games/spill-1?error=hole_reminder_not_active'],
    [{ ok: false, reason: 'not_found' }, '/admin/games/spill-1?error=hole_reminder_not_active'],
    [{ ok: true, reminded: 0 }, '/admin/games/spill-1?error=hole_reminder_failed'],
    [{ ok: true, reminded: 2 }, '/admin/games/spill-1?status=hole_reminded&count=2'],
  ] as const)('%o → %s', async (result, url) => {
    sendMock.mockResolvedValueOnce(result);
    expect(await landing()).toBe(url);
    expect(sendMock).toHaveBeenCalledWith('spill-1', ['tore']);
  });

  it('revalidates the desk only after a send that stored something', async () => {
    sendMock.mockResolvedValueOnce({ ok: true, reminded: 0 });
    await landing();
    expect(revalidatePathMock).not.toHaveBeenCalled();

    sendMock.mockResolvedValueOnce({ ok: true, reminded: 1 });
    await landing();
    expect(revalidatePathMock).toHaveBeenCalledWith('/admin/games/spill-1');
  });
});
