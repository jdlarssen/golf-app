import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeLocaleRedirectMock, RedirectError } from '@/tests/serverActionMocks';

/**
 * #2483: the Status page's «bekreft at du er med»-purring is the gate and the
 * redirect; who is reminded lives in the core (`lib/games/remindUnconfirmed.ts`,
 * own suite), mocked here at its edge. The admin reminds everyone at once:
 * no `userIds`.
 */

const redirectMock = makeLocaleRedirectMock();
vi.mock('@/i18n/navigation', () => ({
  redirect: (arg: { href: string; locale?: string } | string) => redirectMock(arg),
}));
vi.mock('next-intl/server', () => ({ getLocale: async () => 'no' }));
vi.mock('@/lib/i18n/revalidateLocalePath', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ getServerClient: async () => ({}) }));
const requireAdminMock = vi.fn(async () => {});
vi.mock('@/lib/admin/auth', () => ({ requireAdmin: () => requireAdminMock() }));
vi.mock('@/lib/games/remindUnsubmitted', () => ({ sendReminders: vi.fn() }));
const sendMock = vi.fn();
vi.mock('@/lib/games/remindUnconfirmed', () => ({
  sendUnconfirmedReminders: (...args: unknown[]) => sendMock(...args),
}));

import { remindUnconfirmedPlayers } from './actions';

async function landing(): Promise<string> {
  try {
    await remindUnconfirmedPlayers('spill-1');
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

describe('remindUnconfirmedPlayers', () => {
  it('stops at the gate: a non-admin never reaches the core', async () => {
    requireAdminMock.mockImplementation(async () => {
      throw new RedirectError('/');
    });
    expect(await landing()).toBe('/');
    expect(sendMock).not.toHaveBeenCalled();
  });

  it.each([
    [{ ok: true, reminded: 2 }, '/admin/games/spill-1/status?status=reminded_unconfirmed&count=2'],
    [{ ok: false, reason: 'not_active' }, '/admin/games/spill-1/status?error=not_active'],
    [{ ok: false, reason: 'not_found' }, '/admin/games/spill-1/status?error=not_found'],
  ])('core says %j → %s, and reminds everyone (no filter)', async (result, url) => {
    sendMock.mockResolvedValue(result);
    expect(await landing()).toBe(url);
    expect(sendMock).toHaveBeenCalledWith('spill-1');
  });
});
