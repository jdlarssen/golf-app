import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  buildSupabaseMock,
  makeLocaleRedirectMock,
  RedirectError,
} from '@/tests/serverActionMocks';

/**
 * Club deletes must hit a row (trap 2, audit 2026-11-20): `leaveClub` here,
 * `cancelInvitation` on the club's back room. A delete that matched 0 rows
 * (RLS refused, or the row was already gone) used to report success.
 */

const redirectMock = makeLocaleRedirectMock();
vi.mock('@/i18n/navigation', () => ({
  redirect: (arg: { href: string; locale?: string } | string) => redirectMock(arg),
}));
vi.mock('next-intl/server', () => ({ getLocale: async () => 'no' }));
vi.mock('@/lib/i18n/revalidateLocalePath', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/mail/clubInviteNotification', () => ({ sendClubInviteNotification: vi.fn() }));

let supabaseMock: ReturnType<typeof buildSupabaseMock>;
vi.mock('@/lib/supabase/server', () => ({ getServerClient: async () => supabaseMock }));
let adminMock: ReturnType<typeof buildSupabaseMock>;
vi.mock('@/lib/supabase/admin', () => ({ getAdminClient: () => adminMock }));

import { leaveClub } from './actions';
import { cancelInvitation } from '../actions';

const GROUP = 'g-1';

function fd(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [k, v] of Object.entries(entries)) data.set(k, v);
  return data;
}

async function urlOf(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
  } catch (err) {
    if (err instanceof RedirectError) return err.url;
    throw err;
  }
  throw new Error('expected a redirect');
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('leaveClub', () => {
  it.each([
    ['one row deleted → back to the club list', { data: [{ user_id: 'u-1' }], error: null }, '/klubber'],
    ['0 rows → leave_failed', { data: [], error: null }, `/klubber/${GROUP}/forlat?error=leave_failed`],
    ['DB error → leave_failed', { data: null, error: { message: 'nede' } }, `/klubber/${GROUP}/forlat?error=leave_failed`],
  ])('%s', async (_label, deleteResult, expected) => {
    adminMock = buildSupabaseMock([
      { count: 2, data: null, error: null }, // owners
      { data: { role: 'member' }, error: null }, // the caller's row
    ]);
    supabaseMock = buildSupabaseMock([deleteResult]);
    supabaseMock.auth.getUser.mockResolvedValue({ data: { user: { id: 'u-1' } } });
    expect(await urlOf(() => leaveClub(fd({ groupId: GROUP })))).toBe(expected);
  });
});

describe('cancelInvitation', () => {
  it.each([
    ['one row deleted → cancelled=ok', { data: [{ id: 'inv-1' }], error: null }, 'ok'],
    ['0 rows → cancelled=error', { data: [], error: null }, 'error'],
    ['DB error → cancelled=error', { data: null, error: { message: 'nede' } }, 'error'],
  ])('%s', async (_label, deleteResult, code) => {
    supabaseMock = buildSupabaseMock([deleteResult]);
    supabaseMock.auth.getUser.mockResolvedValue({ data: { user: { id: 'u-1' } } });
    expect(
      await urlOf(() => cancelInvitation(fd({ groupId: GROUP, invitationId: 'inv-1' }))),
    ).toBe(`/klubber/${GROUP}/administrer?cancelled=${code}`);
  });
});
