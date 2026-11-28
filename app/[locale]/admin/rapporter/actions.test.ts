import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  buildSupabaseMock,
  makeLocaleRedirectMock,
  RedirectError,
} from '@/tests/serverActionMocks';

/**
 * #3019: the admin's actions on a report. Each writes as the admin, asserts
 * the row, expires the game cache on a game change, logs, and goes back to
 * the list with a notice or an error code the page knows. Admin-only RLS on
 * content_reports is in supabase/tests/report_block_rls_test.sql.
 */

let supabaseMock: ReturnType<typeof buildSupabaseMock>;
vi.mock('@/lib/supabase/server', () => ({ getServerClient: async () => supabaseMock }));
vi.mock('@/lib/admin/auth', () => ({
  requireAdmin: vi.fn(async () => ({ userId: 'admin-1', name: 'Sara', isAdmin: true })),
}));
const auditMock = vi.fn(async (..._args: unknown[]) => {});
vi.mock('@/lib/admin/auditLog', () => ({ logAdminEvent: (...a: unknown[]) => auditMock(...a) }));
const expireMock = vi.fn();
vi.mock('@/lib/games/expireGameCache', () => ({ expireGameCache: (id: string) => expireMock(id) }));
vi.mock('@/lib/i18n/revalidateLocalePath', () => ({ revalidatePath: vi.fn() }));
const redirectMock = makeLocaleRedirectMock();
vi.mock('@/i18n/navigation', () => ({
  redirect: (arg: { href: string; locale?: string } | string) => redirectMock(arg),
}));
vi.mock('next-intl/server', () => ({ getLocale: async () => 'no' }));

async function run(
  action: 'renameReportedGame' | 'clearReportedPrizes' | 'markReportHandled',
  fields: Record<string, string>,
): Promise<string | undefined> {
  const actions = await import('./actions');
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  try {
    await actions[action](fd);
    return undefined;
  } catch (err) {
    if (err instanceof RedirectError) return err.url;
    throw err;
  }
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('renameReportedGame', () => {
  it('renames the round, expires its cache and logs the old name', async () => {
    supabaseMock = buildSupabaseMock([
      { data: { name: 'Gammelt navn' }, error: null }, // before
      { data: [{ id: 'g1' }], error: null }, // update .select('id')
    ]);
    expect(await run('renameReportedGame', { reportId: 'r1', gameId: 'g1', name: ' Lørdag ' })).toBe(
      '/admin/rapporter?notice=renamed',
    );
    const update = supabaseMock.__fromCalls.find((c) => c.table === 'games' && c.method === 'update');
    expect(update?.args[0]).toEqual({ name: 'Lørdag' });
    expect(expireMock).toHaveBeenCalledWith('g1');
    expect(auditMock).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'report.game_renamed', payload: { reportId: 'r1', from: 'Gammelt navn', to: 'Lørdag' } }),
    );
  });

  it('answers the word filter with its own code and changes nothing else', async () => {
    supabaseMock = buildSupabaseMock([
      { data: { name: 'Gammelt navn' }, error: null },
      { data: null, error: { code: 'P0001', message: 'blocked_word' } },
    ]);
    expect(await run('renameReportedGame', { reportId: 'r1', gameId: 'g1', name: 'Kuk' })).toBe(
      '/admin/rapporter?error=blocked_word',
    );
    expect(expireMock).not.toHaveBeenCalled();
    expect(auditMock).not.toHaveBeenCalled();
  });

  it('refuses an empty name before any write', async () => {
    supabaseMock = buildSupabaseMock([]);
    expect(await run('renameReportedGame', { reportId: 'r1', gameId: 'g1', name: '  ' })).toBe(
      '/admin/rapporter?error=invalid',
    );
    expect(supabaseMock.__fromCalls).toHaveLength(0);
  });
});

describe('clearReportedPrizes', () => {
  it('keeps every prize row but removes its words and sponsor', async () => {
    supabaseMock = buildSupabaseMock([
      {
        data: {
          prizes: [{ category: 'longest_drive', position: 1, description: 'Største dust', sponsor: 'X AS', sponsorLogoPath: 'a.png' }],
        },
        error: null,
      },
      { data: [{ id: 'g1' }], error: null },
    ]);
    expect(await run('clearReportedPrizes', { reportId: 'r1', gameId: 'g1' })).toBe(
      '/admin/rapporter?notice=prizes_cleared',
    );
    const update = supabaseMock.__fromCalls.find((c) => c.table === 'games' && c.method === 'update');
    expect(update?.args[0]).toEqual({
      prizes: [{ category: 'longest_drive', position: 1, description: 'Premie', sponsor: null, sponsorLogoPath: null }],
    });
    expect(expireMock).toHaveBeenCalledWith('g1');
  });
});

describe('markReportHandled', () => {
  it('stamps the report with the admin and the time', async () => {
    supabaseMock = buildSupabaseMock([{ data: [{ id: 'r1' }], error: null }]);
    expect(await run('markReportHandled', { reportId: 'r1' })).toBe('/admin/rapporter?notice=handled');
    const update = supabaseMock.__fromCalls.find((c) => c.table === 'content_reports' && c.method === 'update');
    expect((update?.args[0] as { handled_by: string }).handled_by).toBe('admin-1');
    expect(auditMock).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'report.handled', targetId: 'r1' }));
  });

  it('says so when the report was already handled (0 rows)', async () => {
    supabaseMock = buildSupabaseMock([{ data: [], error: null }]);
    expect(await run('markReportHandled', { reportId: 'r1' })).toBe('/admin/rapporter?error=not_found');
    expect(auditMock).not.toHaveBeenCalled();
  });
});
