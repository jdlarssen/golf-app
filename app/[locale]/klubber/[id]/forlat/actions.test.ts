import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  buildSupabaseMock,
  makeLocaleRedirectMock,
  RedirectError,
} from '@/tests/serverActionMocks';

/**
 * Club deletes must hit a row (trap 2, audit 2026-11-20): `leaveClub` here,
 * `cancelInvitation` on the club's back room. A delete that matched 0 rows
 * (RLS refused, or the row was already gone) used to report success. A leave
 * re-reads the membership: gone counts as left. The sole-owner guard stops on
 * a failed read instead of being skipped.
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

// The guard's two reads run in one Promise.all: the caller's row resolves
// first in the mock (`.maybeSingle()` claims its result when called), then the
// owner count (claimed when awaited).
const MEMBER_ROW = { data: { role: 'member' }, error: null };
const TWO_OWNERS = { count: 2, data: null, error: null };

describe('leaveClub', () => {
  async function leave(admin: Parameters<typeof buildSupabaseMock>[0], deleteResult: unknown) {
    adminMock = buildSupabaseMock(admin);
    supabaseMock = buildSupabaseMock(deleteResult === undefined ? [] : [deleteResult as never]);
    supabaseMock.auth.getUser.mockResolvedValue({ data: { user: { id: 'u-1' } } });
    return urlOf(() => leaveClub(fd({ groupId: GROUP })));
  }

  it('one row deleted → back to the club list', async () => {
    expect(await leave([MEMBER_ROW, TWO_OWNERS], { data: [{ user_id: 'u-1' }], error: null })).toBe('/klubber');
  });

  it.each([
    ['0 rows, membership gone (double tap) → the leave worked', { data: null, error: null }, '/klubber'],
    ['0 rows, membership still there → leave_failed', { data: { user_id: 'u-1' }, error: null }, `/klubber/${GROUP}/forlat?error=leave_failed`],
    ['0 rows, re-read fails → leave_failed', { data: null, error: { message: 'nede' } }, `/klubber/${GROUP}/forlat?error=leave_failed`],
  ])('%s', async (_label, reread, expected) => {
    expect(await leave([MEMBER_ROW, TWO_OWNERS, reread], { data: [], error: null })).toBe(expected);
  });

  it('DB error on the delete, membership still there → leave_failed', async () => {
    expect(
      await leave([MEMBER_ROW, TWO_OWNERS, { data: { user_id: 'u-1' }, error: null }], {
        data: null,
        error: { message: 'nede' },
      }),
    ).toBe(`/klubber/${GROUP}/forlat?error=leave_failed`);
  });

  it.each([
    ['the caller read fails', [{ data: null, error: { message: 'nede' } }, TWO_OWNERS]],
    ['the owner count fails', [{ data: { role: 'owner' }, error: null }, { count: null, data: null, error: { message: 'nede' } }]],
  ])('%s → leave_failed, nothing deleted', async (_label, admin) => {
    expect(await leave(admin as never, undefined)).toBe(`/klubber/${GROUP}/forlat?error=leave_failed`);
    expect(supabaseMock.__fromCalls.some((c) => c.method === 'delete')).toBe(false);
  });

  it('the sole owner is stopped', async () => {
    expect(
      await leave([{ data: { role: 'owner' }, error: null }, { count: 1, data: null, error: null }], undefined),
    ).toBe(`/klubber/${GROUP}/forlat?error=sole_owner`);
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
