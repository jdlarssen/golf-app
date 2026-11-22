import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildSupabaseMock, makeRedirectMock, RedirectError } from '@/tests/serverActionMocks';

/**
 * Audit 2026-11-20 (AGENTS.md trap 2): the club-terms save is row-counted. A
 * club id that matches nothing answers `error: null` with 0 rows and must not
 * say «lagret».
 */

const redirectMock = makeRedirectMock();
vi.mock('@/i18n/navigation', () => ({
  redirect: (arg: { href: string } | string) => redirectMock(typeof arg === 'string' ? arg : arg.href),
}));
vi.mock('next-intl/server', () => ({ getLocale: async () => 'no' }));
vi.mock('@/lib/i18n/revalidateLocalePath', () => ({ revalidatePath: vi.fn() }));

let serverMock: ReturnType<typeof buildSupabaseMock>;
let adminMock: ReturnType<typeof buildSupabaseMock>;
vi.mock('@/lib/supabase/server', () => ({ getServerClient: async () => serverMock }));
vi.mock('@/lib/supabase/admin', () => ({ getAdminClient: () => adminMock }));

function form(): FormData {
  const fd = new FormData();
  fd.set('group_id', 'club-1');
  fd.set('member_cap', '40');
  fd.set('varighet_mode', 'ubegrenset');
  return fd;
}

async function run(updateResult: { data: unknown; error: unknown }): Promise<string> {
  serverMock = buildSupabaseMock([{ data: { is_admin: true }, error: null }]);
  serverMock.auth.getUser = vi.fn(async () => ({ data: { user: { id: 'admin-1' } }, error: null })) as never;
  adminMock = buildSupabaseMock([updateResult as never]);
  const { updateClubTerms } = await import('./actions');
  const err = await updateClubTerms(form()).catch((e: unknown) => e);
  expect(err).toBeInstanceOf(RedirectError);
  return (err as RedirectError).url;
}

beforeEach(() => vi.clearAllMocks());

describe('updateClubTerms — row check', () => {
  it('a saved row says updated', async () => {
    expect(await run({ data: [{ id: 'club-1' }], error: null })).toBe('/admin/klubber/club-1?updated=1');
  });

  it('a save that touched 0 rows says error=unknown', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await run({ data: [], error: null })).toBe('/admin/klubber/club-1?error=unknown');
  });
});
