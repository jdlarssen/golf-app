import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  buildSupabaseMock,
  makeLocaleRedirectMock,
  RedirectError,
} from '@/tests/serverActionMocks';

/**
 * removeMember's guards (audit 2026-11-20): the caller's role, the target's
 * role and the owner count are read before the delete. A failed read used to
 * read as «no row», which skipped the role rule and the last-owner guard. Now
 * it stops with remove_failed, and nothing is deleted.
 */

const redirectMock = makeLocaleRedirectMock();
vi.mock('@/i18n/navigation', () => ({
  redirect: (arg: { href: string; locale?: string } | string) => redirectMock(arg),
}));
vi.mock('next-intl/server', () => ({ getLocale: async () => 'no' }));
vi.mock('@/lib/i18n/revalidateLocalePath', () => ({ revalidatePath: vi.fn() }));

let supabaseMock: ReturnType<typeof buildSupabaseMock>;
vi.mock('@/lib/supabase/server', () => ({ getServerClient: async () => supabaseMock }));
let adminMock: ReturnType<typeof buildSupabaseMock>;
vi.mock('@/lib/supabase/admin', () => ({ getAdminClient: () => adminMock }));

import { removeMember } from './actions';

const GROUP = 'g-1';
const TARGET = 'u-2';
const FAILED = `/klubber/${GROUP}/fjern/${TARGET}?error=remove_failed`;
const DOWN = { message: 'nede' };

async function run(admin: Parameters<typeof buildSupabaseMock>[0], deleteResult?: unknown) {
  adminMock = buildSupabaseMock(admin);
  supabaseMock = buildSupabaseMock(deleteResult === undefined ? [] : [deleteResult as never]);
  supabaseMock.auth.getUser.mockResolvedValue({ data: { user: { id: 'u-1' } } });
  const form = new FormData();
  form.set('groupId', GROUP);
  form.set('targetUserId', TARGET);
  try {
    await removeMember(form);
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

describe('removeMember', () => {
  it.each([
    ['the caller read fails', [{ data: null, error: DOWN }, { data: { role: 'member' }, error: null }]],
    ['the target read fails', [{ data: { role: 'admin' }, error: null }, { data: null, error: DOWN }]],
    [
      'the owner count fails',
      [{ data: { role: 'owner' }, error: null }, { data: { role: 'owner' }, error: null }, { count: null, data: null, error: DOWN }],
    ],
  ])('%s → remove_failed, nothing deleted', async (_label, admin) => {
    expect(await run(admin as never)).toBe(FAILED);
    expect(supabaseMock.__fromCalls.some((c) => c.method === 'delete')).toBe(false);
  });

  it('the sole owner cannot be removed', async () => {
    expect(
      await run([
        { data: { role: 'owner' }, error: null },
        { data: { role: 'owner' }, error: null },
        { count: 1, data: null, error: null },
      ]),
    ).toBe(`/klubber/${GROUP}/fjern/${TARGET}?error=sole_owner`);
  });

  it('an admin cannot remove an owner', async () => {
    expect(
      await run([
        { data: { role: 'admin' }, error: null },
        { data: { role: 'owner' }, error: null },
      ]),
    ).toBe(`/klubber/${GROUP}/medlemmer`);
  });

  it('an admin removes a member', async () => {
    expect(
      await run(
        [
          { data: { role: 'admin' }, error: null },
          { data: { role: 'member' }, error: null },
        ],
        { data: [{ user_id: TARGET }], error: null },
      ),
    ).toBe(`/klubber/${GROUP}/medlemmer`);
  });
});
