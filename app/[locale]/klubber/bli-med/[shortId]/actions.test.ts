import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  buildSupabaseMock,
  makeLocaleRedirectMock,
  RedirectError,
} from '@/tests/serverActionMocks';

/**
 * A new club request after a rejection, a leave or a removal (audit
 * 2026-11-20). One row per (club, user) across every status (UNIQUE in 0075),
 * so the insert hits a duplicate. The old row is reopened as pending and the
 * admins are told; before, the page said «sent» and nothing was stored.
 */

const redirectMock = makeLocaleRedirectMock();
vi.mock('@/i18n/navigation', () => ({
  redirect: (arg: { href: string; locale?: string } | string) => redirectMock(arg),
}));
vi.mock('next-intl/server', () => ({ getLocale: async () => 'no' }));
const notifyMock = vi.fn(async (_arg: unknown) => {});
vi.mock('@/lib/notifications/notify', () => ({ notify: (arg: unknown) => notifyMock(arg) }));

let supabaseMock: ReturnType<typeof buildSupabaseMock>;
vi.mock('@/lib/supabase/server', () => ({ getServerClient: async () => supabaseMock }));
let adminMock: ReturnType<typeof buildSupabaseMock>;
vi.mock('@/lib/supabase/admin', () => ({ getAdminClient: () => adminMock }));

import { requestToJoin } from './actions';

const SHORT = 'abc123';
const GROUP = { id: 'g-1', name: 'Solnedgang GK' };
const DUPLICATE = { data: null, error: { code: '23505', message: 'duplicate key value' } };

function form(): FormData {
  const data = new FormData();
  data.set('shortId', SHORT);
  return data;
}

async function run(): Promise<string> {
  try {
    await requestToJoin(form());
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

function setup(admin: Parameters<typeof buildSupabaseMock>[0], insert: unknown) {
  adminMock = buildSupabaseMock(admin);
  supabaseMock = buildSupabaseMock([insert as never]);
  supabaseMock.auth.getUser.mockResolvedValue({ data: { user: { id: 'u-1' } } });
}

const ADMINS = { data: [{ user_id: 'owner-1' }], error: null };
const REQUESTER = { data: { name: 'Kari Nordmann', nickname: null, email: 'kari@example.test' }, error: null };

describe('requestToJoin', () => {
  it.each(['rejected', 'approved', 'withdrawn'])(
    'old %s row → reopened as pending, the admins are told',
    async (status) => {
      setup(
        [
          { data: GROUP, error: null }, // groups
          { data: null, error: null }, // not a member
          { data: { id: 'req-1', status }, error: null }, // the old row
          { data: [{ id: 'req-1' }], error: null }, // reopen hit the row
          ADMINS,
          REQUESTER,
        ],
        DUPLICATE,
      );
      expect(await run()).toBe(`/klubber/bli-med/${SHORT}?sent=1`);
      const update = adminMock.__fromCalls.find((c) => c.method === 'update');
      expect(update?.args[0]).toMatchObject({ status: 'pending', decided_at: null, decided_by_user_id: null });
      // Only the row that was read, in the status it was read in.
      const eqs = adminMock.__fromCalls
        .slice(adminMock.__fromCalls.indexOf(update!))
        .filter((c) => c.method === 'eq')
        .map((c) => c.args)
        .slice(0, 2);
      expect(eqs).toEqual([['id', 'req-1'], ['status', status]]);
      expect(notifyMock).toHaveBeenCalledTimes(1);
    },
  );

  it('old pending row → «sent», nothing written, nobody told twice', async () => {
    setup(
      [
        { data: GROUP, error: null },
        { data: null, error: null },
        { data: { id: 'req-1', status: 'pending' }, error: null },
      ],
      DUPLICATE,
    );
    expect(await run()).toBe(`/klubber/bli-med/${SHORT}?sent=1`);
    expect(adminMock.__fromCalls.some((c) => c.method === 'update')).toBe(false);
    expect(notifyMock).not.toHaveBeenCalled();
  });

  it.each([
    ['the reopen matched 0 rows', { data: [], error: null }],
    ['the reopen failed', { data: null, error: { message: 'nede' } }],
  ])('%s → error, nobody told', async (_label, reopen) => {
    setup(
      [
        { data: GROUP, error: null },
        { data: null, error: null },
        { data: { id: 'req-1', status: 'rejected' }, error: null },
        reopen,
      ],
      DUPLICATE,
    );
    expect(await run()).toBe(`/klubber/bli-med/${SHORT}?error=unknown`);
    expect(notifyMock).not.toHaveBeenCalled();
  });

  it('the membership read fails → error, no insert', async () => {
    setup(
      [
        { data: GROUP, error: null },
        { data: null, error: { message: 'nede' } },
      ],
      { data: null, error: null },
    );
    expect(await run()).toBe(`/klubber/bli-med/${SHORT}?error=unknown`);
    expect(supabaseMock.__fromCalls.some((c) => c.method === 'insert')).toBe(false);
  });

  it('first request → stored and the admins are told', async () => {
    setup([{ data: GROUP, error: null }, { data: null, error: null }, ADMINS, REQUESTER], {
      data: null,
      error: null,
    });
    expect(await run()).toBe(`/klubber/bli-med/${SHORT}?sent=1`);
    expect(notifyMock).toHaveBeenCalledTimes(1);
  });
});
