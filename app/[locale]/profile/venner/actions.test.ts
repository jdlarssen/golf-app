// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RedirectError, makeLocaleRedirectMock } from '@/tests/serverActionMocks';

/**
 * Type A (0252): the web shell around «Legg til venn på e-post». The rule
 * lives in `lib/friends/friendActionsCore.ts`; what must hold here is that
 * the shell gives one landing for the one answer, hands the after-work to
 * `after`, and never puts the address in the URL.
 */

const redirectMock = makeLocaleRedirectMock();
vi.mock('@/i18n/navigation', () => ({
  redirect: (arg: { href: string; locale?: string } | string) =>
    redirectMock(typeof arg === 'string' ? arg : arg.href),
}));
vi.mock('next-intl/server', () => ({ getLocale: async () => 'no' }));
const afterMock = vi.fn();
vi.mock('next/server', () => ({ after: (task: unknown) => afterMock(task) }));
vi.mock('@/lib/supabase/server', () => ({
  getServerClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'meg' } } }) } }),
}));
const addByEmailMock = vi.fn();
vi.mock('@/lib/friends/friendActionsCore', () => ({
  addByEmail: (...args: unknown[]) => addByEmailMock(...args),
  remove: vi.fn(),
  respond: vi.fn(),
  sendRequest: vi.fn(),
}));

import { addFriendByEmail } from './actions';

async function landing(email: string): Promise<string> {
  const form = new FormData();
  form.set('email', email);
  try {
    await addFriendByEmail(form);
  } catch (err) {
    if (err instanceof RedirectError) return err.url;
    throw err;
  }
  throw new Error('expected a redirect');
}

beforeEach(() => vi.clearAllMocks());

describe('addFriendByEmail', () => {
  it('lands on the one receipt, without the address in the URL', async () => {
    addByEmailMock.mockResolvedValue('requested');
    expect(await landing(' Kari@Example.com ')).toBe('/profile/venner?status=sent_by_email');
    expect(addByEmailMock).toHaveBeenCalledWith(expect.anything(), 'meg', 'kari@example.com', expect.any(Function));
  });

  it('hands the after-work to `after`', async () => {
    addByEmailMock.mockImplementation(async (_c, _u, _e, defer: (task: () => Promise<void>) => void) => {
      defer(async () => {});
      return 'requested';
    });
    await landing('kari@example.com');
    expect(afterMock).toHaveBeenCalledTimes(1);
  });

  it.each(['self', 'invalid_email', 'disposable_email', 'quota', 'error'] as const)(
    'carries «%s» to the page',
    async (status) => {
      addByEmailMock.mockResolvedValue(status);
      expect(await landing('kari@example.com')).toBe(`/profile/venner?status=${status}`);
    },
  );

  it('sends an unfinished profile to the profile step', async () => {
    addByEmailMock.mockResolvedValue('profile_incomplete');
    expect(await landing('kari@example.com')).toBe('/complete-profile');
  });

  it('asks for an address without calling the core when the field is empty', async () => {
    expect(await landing('   ')).toBe('/profile/venner?status=email_required');
    expect(addByEmailMock).not.toHaveBeenCalled();
  });
});
