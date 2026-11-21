import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  buildSupabaseMock,
  makeLocaleRedirectMock,
  RedirectError,
} from '@/tests/serverActionMocks';
import { recomputeCourseHandicapForUser } from '@/lib/games/recomputeCourseHandicap';

/**
 * Unit tests for the admin player-edit server action.
 *
 * Handicap parsing (#2048): the admin form must read the handicap with the
 * same format check and bounds as the profile (`parseHcpMagnitude` in
 * lib/users/profileInput). The hcp check runs before any Supabase call.
 *
 * The users write (#2054): a write that matched 0 rows must not report
 * «lagret», and a changed auth email must be rolled back.
 */

const redirectMock = makeLocaleRedirectMock();
vi.mock('@/i18n/navigation', () => ({
  redirect: (arg: { href: string; locale?: string } | string) =>
    redirectMock(typeof arg === 'string' ? arg : arg.href),
}));
vi.mock('next-intl/server', () => ({
  getLocale: async () => 'no',
}));
let supabaseMock: ReturnType<typeof buildSupabaseMock> | null = null;
vi.mock('@/lib/supabase/server', () => ({
  getServerClient: async () => {
    if (!supabaseMock) throw new Error('supabase must not be reached in these tests');
    return supabaseMock;
  },
}));
const updateUserByIdMock = vi.fn();
// #2207: the current e-post is read with the admin client (users.email is not
// readable through a user session); its queue answers that read.
let adminQueryMock = buildSupabaseMock([]);
vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => ({
    auth: { admin: { updateUserById: updateUserByIdMock } },
    from: (table: string) => adminQueryMock.from(table),
    // 0252: the address check runs with the service role.
    rpc: (name: string, params: unknown) => adminQueryMock.rpc(name, params),
  }),
}));
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
  supabaseMock = null;
  adminQueryMock = buildSupabaseMock([{ data: { email: 'ola@example.test' }, error: null }]);
  updateUserByIdMock.mockResolvedValue({ data: {}, error: null });
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

describe('updateUser — the users write must hit the row (#2054)', () => {
  const OLD_EMAIL = 'ola@example.test';
  const NEW_EMAIL = 'ny@example.test';

  function validForm(email = OLD_EMAIL): FormData {
    const data = form('12,5');
    data.set('email', email);
    return data;
  }

  async function run(data: FormData): Promise<string> {
    try {
      await updateUser(data);
    } catch (err) {
      if (err instanceof RedirectError) return err.url;
      throw err;
    }
    throw new Error('expected a redirect');
  }

  it('0 rows → update_failed, and the handicap recompute does not run', async () => {
    supabaseMock = buildSupabaseMock([
      { data: [], error: null }, // update … select('id') matched nothing
    ]);
    expect(await run(validForm())).toBe(`/admin/spillere/${ID}?error=update_failed`);
    expect(recomputeCourseHandicapForUser).not.toHaveBeenCalled();
    // Email unchanged → auth was never touched, so there is nothing to roll back.
    expect(updateUserByIdMock).not.toHaveBeenCalled();
  });

  it('DB error → update_failed, and the handicap recompute does not run', async () => {
    supabaseMock = buildSupabaseMock([
      { data: null, error: { message: 'boom' } },
    ]);
    expect(await run(validForm())).toBe(`/admin/spillere/${ID}?error=update_failed`);
    expect(recomputeCourseHandicapForUser).not.toHaveBeenCalled();
  });

  it('0 rows after an email change → the auth email is rolled back to the old one', async () => {
    supabaseMock = buildSupabaseMock([
      { data: [], error: null }, // no scheduled or active round
      { data: [], error: null }, // update matched nothing
    ]);
    expect(await run(validForm(NEW_EMAIL))).toBe(`/admin/spillere/${ID}?error=update_failed`);
    expect(updateUserByIdMock).toHaveBeenNthCalledWith(1, ID, { email: NEW_EMAIL });
    expect(updateUserByIdMock).toHaveBeenNthCalledWith(2, ID, { email: OLD_EMAIL });
    expect(recomputeCourseHandicapForUser).not.toHaveBeenCalled();
  });

  it('the address check runs with the service role, and a taken address stops the change (0252)', async () => {
    adminQueryMock = buildSupabaseMock(
      [{ data: { email: OLD_EMAIL }, error: null }],
      { email_is_registered: true, email_is_in_auth_users: false },
    );
    supabaseMock = buildSupabaseMock([
      { data: [], error: null }, // no scheduled or active round
    ]);
    expect(await run(validForm(NEW_EMAIL))).toBe(`/admin/spillere/${ID}?error=email_in_use`);
    expect(adminQueryMock.rpc).toHaveBeenCalledWith('email_is_registered', { p_email: NEW_EMAIL });
    expect(supabaseMock.rpc).not.toHaveBeenCalled();
    expect(updateUserByIdMock).not.toHaveBeenCalled();
  });

  it('a failed address check stops the change (0252)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    adminQueryMock = buildSupabaseMock(
      [{ data: { email: OLD_EMAIL }, error: null }],
      {},
      { rpcErrors: { email_is_registered: { message: 'nede' } } },
    );
    supabaseMock = buildSupabaseMock([
      { data: [], error: null }, // no scheduled or active round
    ]);
    expect(await run(validForm(NEW_EMAIL))).toBe(`/admin/spillere/${ID}?error=email_update_failed`);
    expect(updateUserByIdMock).not.toHaveBeenCalled();
  });

  it('a normal save → status=updated, and the recompute runs', async () => {
    supabaseMock = buildSupabaseMock([
      { data: [{ id: ID }], error: null },
    ]);
    expect(await run(validForm())).toBe(`/admin/spillere/${ID}?status=updated`);
    expect(recomputeCourseHandicapForUser).toHaveBeenCalledWith(ID, 12.5);
    expect(updateUserByIdMock).not.toHaveBeenCalled();
    const selectAfterUpdate = supabaseMock.__fromCalls.findLastIndex((c) => c.method === 'select');
    const update = supabaseMock.__fromCalls.findIndex((c) => c.method === 'update');
    expect(selectAfterUpdate).toBeGreaterThan(update);
  });

  it.each([
    ['in a scheduled or active round', [{ data: [{ game_id: 'g1', games: { status: 'scheduled' } }], error: null }], 'email_change_blocked_active_game'],
    ['the round check fails', [{ data: null, error: { message: 'nede' } }], 'email_update_failed'],
  ])('e-mail change, %s → %s, auth untouched (audit 2026-11-20)', async (_label, queue, code) => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    supabaseMock = buildSupabaseMock(queue);
    expect(await run(validForm(NEW_EMAIL))).toBe(`/admin/spillere/${ID}?error=${code}`);
    expect(updateUserByIdMock).not.toHaveBeenCalled();
    const statusFilter = supabaseMock.__fromCalls.find((c) => c.method === 'in');
    expect(statusFilter?.args).toEqual(['games.status', ['scheduled', 'active']]);
  });

  it('the current e-mail read fails → update_failed, nothing is written (audit 2026-11-20)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    adminQueryMock = buildSupabaseMock([{ data: null, error: { message: 'nede' } }]);
    supabaseMock = buildSupabaseMock([]);
    expect(await run(validForm(NEW_EMAIL))).toBe(`/admin/spillere/${ID}?error=update_failed`);
    expect(updateUserByIdMock).not.toHaveBeenCalled();
    expect(supabaseMock.__fromCalls).toEqual([]);
  });
});
