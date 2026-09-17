import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeLocaleRedirectMock, RedirectError } from '@/tests/serverActionMocks';

/**
 * Unit tests for the admin player-edit server action.
 *
 * Scoped to the handicap parsing (#2048): the admin form must read the
 * handicap with the same format check and bounds as the profile
 * (`parseHcpMagnitude` in lib/users/profileInput). The hcp check runs before
 * any Supabase call, so the only mock that matters is a throwing `redirect`.
 */

const redirectMock = makeLocaleRedirectMock();
vi.mock('@/i18n/navigation', () => ({
  redirect: (arg: { href: string; locale?: string } | string) =>
    redirectMock(typeof arg === 'string' ? arg : arg.href),
}));
vi.mock('next-intl/server', () => ({
  getLocale: async () => 'no',
}));
vi.mock('@/lib/supabase/server', () => ({
  getServerClient: async () => {
    throw new Error('supabase must not be reached in these tests');
  },
}));
vi.mock('@/lib/supabase/admin', () => ({ getAdminClient: vi.fn() }));
vi.mock('@/lib/admin/auth', () => ({ requireAdmin: vi.fn() }));
vi.mock('@/lib/games/recomputeCourseHandicap', () => ({
  recomputeCourseHandicapForUser: vi.fn(),
}));

import { updateUser } from './actions';

const ID = 'user-1';

/** Every field valid except the email, so a passing hcp stops on email_invalid. */
function form(hcp: string): FormData {
  const data = new FormData();
  data.set('id', ID);
  data.set('name', 'Ola Nordmann');
  data.set('nickname', '');
  data.set('hcp_index', hcp);
  data.set('email', '');
  data.set('gender', 'mens');
  data.set('level', 'normal');
  return data;
}

async function redirectFor(hcp: string): Promise<string> {
  try {
    await updateUser(form(hcp));
  } catch (err) {
    if (err instanceof RedirectError) return err.url;
    throw err;
  }
  throw new Error('expected a redirect');
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('updateUser — handicap uses the shared profile format check (#2048)', () => {
  it.each([
    ['letters after the number', '12abc'],
    ['two decimal separators', '1,2,3'],
    ['spaces around the comma', '12 , 5'],
    ['plus sign', '+3'],
    ['exponent', '1e1'],
    ['above the cap', '54,1'],
    ['plus handicap below the floor', '-10,1'],
    ['empty', ''],
  ])('%s: «%s» → hcp_out_of_range', async (_label, hcp) => {
    expect(await redirectFor(hcp)).toBe(`/admin/spillere/${ID}?error=hcp_out_of_range`);
  });

  it.each([
    ['comma decimal', '12,5'],
    ['dot decimal', '12.5'],
    ['signed plus handicap', '-2,5'],
    ['the cap', '54'],
    ['the floor', '-10'],
    ['trailing separator', '12,5,'],
  ])('%s: «%s» passes the hcp check', async (_label, hcp) => {
    expect(await redirectFor(hcp)).toBe(`/admin/spillere/${ID}?error=email_invalid`);
  });
});
