import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  buildSupabaseMock,
  makeLocaleRedirectMock,
  RedirectError,
} from '@/tests/serverActionMocks';

/**
 * moveFormat (#2347): the arrows in Format-styring. The write goes through the
 * owner's session, so RLS is the authz; `supabase/tests/
 * format_intent_mapping_write_rls_test.sql` proves a non-admin writes nothing.
 */

let supabaseMock: ReturnType<typeof buildSupabaseMock>;
vi.mock('@/lib/supabase/server', () => ({
  getServerClient: async () => supabaseMock,
}));
// The siblings write with the admin client; moveFormat must not.
let adminMock: ReturnType<typeof buildSupabaseMock>;
vi.mock('@/lib/supabase/admin', () => ({ getAdminClient: () => adminMock }));
vi.mock('@/lib/admin/auth', () => ({
  requireAdmin: vi.fn(async () => ({ userId: 'admin-1', name: 'Jørgen', isAdmin: true })),
}));

const recordMock = vi.fn(async (..._args: unknown[]) => {});
vi.mock('@/lib/formats/audit', () => ({
  recordFormatMappingChange: (...args: unknown[]) => recordMock(...args),
}));
const expireMock = vi.fn();
vi.mock('@/lib/formats/expireFormatMappingCache', () => ({
  expireFormatMappingCache: () => expireMock(),
}));

// Success refreshes in place instead of redirecting, so the open tab and the
// focused arrow survive the server's answer.
const refreshMock = vi.fn();
vi.mock('next/cache', () => ({ refresh: () => refreshMock() }));

const redirectMock = makeLocaleRedirectMock();
vi.mock('@/i18n/navigation', () => ({
  redirect: (arg: { href: string; locale?: string } | string) => redirectMock(arg),
}));
vi.mock('next-intl/server', () => ({ getLocale: async () => 'no' }));

const row = (format_slug: string, is_primary: boolean, sort_order: number) => ({
  format_slug,
  is_primary,
  sort_order,
  formats: { is_active: true },
});
// Kompis «Vanligst» on staging starts 1, 2, 3 and ends on three formats that
// share 100; one «Flere muligheter» row is mixed in to prove the group filter.
const KOMPIS_ROWS = [
  row('florida_scramble', true, 100),
  row('best_ball', true, 1),
  row('ambrose', true, 100),
  row('texas_scramble', false, 30),
  row('stableford', true, 2),
];

async function run(fields: Record<string, string>): Promise<string | undefined> {
  const { moveFormat } = await import('./actions');
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  try {
    await moveFormat(fd);
    return undefined;
  } catch (err) {
    if (err instanceof RedirectError) return err.url;
    throw err;
  }
}

const upsertCall = () =>
  supabaseMock.__fromCalls.find((c) => c.table === 'format_intent_mapping' && c.method === 'upsert');

beforeEach(() => {
  vi.clearAllMocks();
  adminMock = buildSupabaseMock([]);
});

describe('moveFormat', () => {
  it('renumbers the whole group (i+1)*10 in one upsert and logs the move by position', async () => {
    supabaseMock = buildSupabaseMock([
      { data: KOMPIS_ROWS, error: null },
      { data: [{}, {}, {}, {}], error: null },
    ]);

    expect(
      await run({ format_slug: 'best_ball', intent: 'kompis', direction: 'down' }),
    ).toBeUndefined();
    expect(refreshMock).toHaveBeenCalledTimes(1);

    expect(upsertCall()?.args).toEqual([
      [
        { format_slug: 'stableford', intent: 'kompis', sort_order: 10 },
        { format_slug: 'best_ball', intent: 'kompis', sort_order: 20 },
        { format_slug: 'ambrose', intent: 'kompis', sort_order: 30 },
        { format_slug: 'florida_scramble', intent: 'kompis', sort_order: 40 },
      ],
      { onConflict: 'format_slug,intent' },
    ]);
    expect(recordMock).toHaveBeenCalledTimes(1);
    expect(recordMock).toHaveBeenCalledWith({
      actorId: 'admin-1',
      actorName: 'Jørgen',
      formatSlug: 'best_ball',
      intent: 'kompis',
      changeType: 'sort_order',
      before: { position: 1 },
      after: { position: 2 },
    });
    expect(expireMock).toHaveBeenCalledTimes(1);
    expect(adminMock.from).not.toHaveBeenCalled();
  });

  it('leaves an error banner behind: a success with had_error goes to the bare URL', async () => {
    supabaseMock = buildSupabaseMock([
      { data: KOMPIS_ROWS, error: null },
      { data: [{}, {}, {}, {}], error: null },
    ]);

    expect(
      await run({ format_slug: 'best_ball', intent: 'kompis', direction: 'down', had_error: '1' }),
    ).toBe('/admin/formats');
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it('is a noop at the edge of the group: no write, no log', async () => {
    supabaseMock = buildSupabaseMock([{ data: KOMPIS_ROWS, error: null }]);

    expect(
      await run({ format_slug: 'best_ball', intent: 'kompis', direction: 'up' }),
    ).toBeUndefined();
    expect(upsertCall()).toBeUndefined();
    expect(recordMock).not.toHaveBeenCalled();
    expect(expireMock).not.toHaveBeenCalled();
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it('is a noop for the only format in its group', async () => {
    supabaseMock = buildSupabaseMock([{ data: KOMPIS_ROWS, error: null }]);

    expect(
      await run({ format_slug: 'texas_scramble', intent: 'kompis', direction: 'down' }),
    ).toBeUndefined();
    expect(upsertCall()).toBeUndefined();
  });

  it('reports db_error when the upsert reaches 0 rows (RLS), and logs nothing', async () => {
    supabaseMock = buildSupabaseMock([
      { data: KOMPIS_ROWS, error: null },
      { data: [], error: null },
    ]);

    expect(
      await run({ format_slug: 'ambrose', intent: 'kompis', direction: 'up' }),
    ).toBe('/admin/formats?error=db_error');
    expect(recordMock).not.toHaveBeenCalled();
    expect(expireMock).not.toHaveBeenCalled();
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it('reports db_error when the upsert reaches fewer rows than the group has', async () => {
    supabaseMock = buildSupabaseMock([
      { data: KOMPIS_ROWS, error: null },
      { data: [{}, {}], error: null },
    ]);

    expect(
      await run({ format_slug: 'ambrose', intent: 'kompis', direction: 'up' }),
    ).toBe('/admin/formats?error=db_error');
    expect(recordMock).not.toHaveBeenCalled();
  });

  it('reports db_error when the read fails', async () => {
    supabaseMock = buildSupabaseMock([{ data: null, error: { message: 'boom' } }]);

    expect(
      await run({ format_slug: 'ambrose', intent: 'kompis', direction: 'up' }),
    ).toBe('/admin/formats?error=db_error');
    expect(upsertCall()).toBeUndefined();
  });

  it('reports not_found for a format that is not in step 2', async () => {
    supabaseMock = buildSupabaseMock([{ data: KOMPIS_ROWS, error: null }]);

    expect(
      await run({ format_slug: 'nassau', intent: 'kompis', direction: 'up' }),
    ).toBe('/admin/formats?error=not_found');
  });

  it('rejects a bad intent and a bad direction before touching the DB', async () => {
    supabaseMock = buildSupabaseMock([]);

    expect(await run({ format_slug: 'wolf', intent: 'cup', direction: 'up' })).toBe(
      '/admin/formats?error=bad_intent',
    );
    expect(await run({ format_slug: 'wolf', intent: 'kompis', direction: 'left' })).toBe(
      '/admin/formats?error=bad_direction',
    );
    expect(supabaseMock.from).not.toHaveBeenCalled();
  });
});

describe('the sibling toggles (#704)', () => {
  it('toggleVisibility reports db_error when its update reaches 0 rows, and logs nothing', async () => {
    supabaseMock = buildSupabaseMock([]);
    adminMock = buildSupabaseMock([
      { data: { is_visible: true, is_primary: false }, error: null }, // existing row
      { data: [], error: null }, // update .select('format_slug')
    ]);
    const { toggleVisibility } = await import('./actions');
    const fd = new FormData();
    fd.set('format_slug', 'nassau');
    fd.set('intent', 'kompis');
    fd.set('next', 'off');

    await expect(toggleVisibility(fd)).rejects.toThrow('/admin/formats?error=db_error');
    expect(recordMock).not.toHaveBeenCalled();
  });
});
