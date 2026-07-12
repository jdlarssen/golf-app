import { describe, it, expect, vi, beforeEach } from 'vitest';

type Row = Record<string, unknown>;

const gamesRows = vi.fn<() => { data: Row[] | null }>();
const eqArg = vi.fn();
const inArg = vi.fn();
const isArg = vi.fn();

// Single games-query mock: select → eq → in → is → order → limit → thenable.
// We capture the filter args so a test can assert the SQL mirrors
// isPubliclyViewable, and drive the returned rows so a test can prove the
// JS predicate gate drops anything the SQL would (defence-in-depth).
vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => ({
    from: (table: string) => {
      if (table !== 'games') {
        throw new Error(`unexpected table ${table}`);
      }
      const b: Record<string, unknown> = {
        select: () => b,
        eq: (...args: unknown[]) => {
          eqArg(...args);
          return b;
        },
        in: (...args: unknown[]) => {
          inArg(...args);
          return b;
        },
        is: (...args: unknown[]) => {
          isArg(...args);
          return b;
        },
        order: () => b,
        limit: () => b,
        then: (
          resolve: (v: unknown) => unknown,
          reject?: (e: unknown) => unknown,
        ) => Promise.resolve(gamesRows()).then(resolve, reject),
      };
      return b;
    },
  }),
}));

beforeEach(() => {
  gamesRows.mockReset();
  eqArg.mockReset();
  inArg.mockReset();
  isArg.mockReset();
});

describe('getPublicDiscoverableGames', () => {
  it('returnerer tom liste når ingen offentlige spill finnes', async () => {
    gamesRows.mockReturnValue({ data: [] });

    const { getPublicDiscoverableGames } = await import(
      './getPublicDiscoverableGames'
    );
    expect(await getPublicDiscoverableGames()).toEqual([]);
  });

  it('mapper rad til DiscoverableOpenGame og dropper status/signups_closed_at', async () => {
    gamesRows.mockReturnValue({
      data: [
        {
          id: 'g1',
          name: 'Sommercup',
          short_id: 'k7m3p9qx',
          scheduled_tee_off_at: '2026-06-01T10:00:00Z',
          registration_mode: 'open',
          status: 'scheduled',
          signups_closed_at: null,
          courses: { name: 'Hauger' },
        },
      ],
    });

    const { getPublicDiscoverableGames } = await import(
      './getPublicDiscoverableGames'
    );
    expect(await getPublicDiscoverableGames()).toEqual([
      {
        id: 'g1',
        name: 'Sommercup',
        short_id: 'k7m3p9qx',
        scheduled_tee_off_at: '2026-06-01T10:00:00Z',
        course_name: 'Hauger',
        registration_mode: 'open',
      },
    ]);
  });

  it('course-join null → course_name null', async () => {
    gamesRows.mockReturnValue({
      data: [
        {
          id: 'g1',
          name: 'Åpen runde',
          short_id: 'open0001',
          scheduled_tee_off_at: null,
          registration_mode: 'manual_approval',
          status: 'scheduled',
          signups_closed_at: null,
          courses: null,
        },
      ],
    });

    const { getPublicDiscoverableGames } = await import(
      './getPublicDiscoverableGames'
    );
    const result = await getPublicDiscoverableGames();
    expect(result[0].course_name).toBeNull();
    expect(result[0].registration_mode).toBe('manual_approval');
  });

  it('query speiler isPubliclyViewable: scheduled + open/manual_approval + signups åpne', async () => {
    gamesRows.mockReturnValue({ data: [] });

    const { getPublicDiscoverableGames } = await import(
      './getPublicDiscoverableGames'
    );
    await getPublicDiscoverableGames();

    expect(eqArg).toHaveBeenCalledWith('status', 'scheduled');
    expect(inArg).toHaveBeenCalledWith('registration_mode', [
      'open',
      'manual_approval',
    ]);
    expect(isArg).toHaveBeenCalledWith('signups_closed_at', null);
  });

  it('predikat-gate dropper alt som ikke er isPubliclyViewable selv om SQL lekker det', async () => {
    // Even if the DB filter ever drifts, the JS gate is the single home for
    // the rule — invite_only/draft/active/closed must never reach the anon
    // list. Mock leaks all four alongside two genuinely-public rows.
    gamesRows.mockReturnValue({
      data: [
        {
          id: 'ok-open',
          name: 'Åpen',
          short_id: 'ok000001',
          scheduled_tee_off_at: null,
          registration_mode: 'open',
          status: 'scheduled',
          signups_closed_at: null,
          courses: null,
        },
        {
          id: 'ok-manual',
          name: 'Med godkjenning',
          short_id: 'ok000002',
          scheduled_tee_off_at: null,
          registration_mode: 'manual_approval',
          status: 'scheduled',
          signups_closed_at: null,
          courses: null,
        },
        {
          id: 'leak-invite',
          name: 'Privat',
          short_id: 'lk000001',
          scheduled_tee_off_at: null,
          registration_mode: 'invite_only',
          status: 'scheduled',
          signups_closed_at: null,
          courses: null,
        },
        {
          id: 'leak-draft',
          name: 'Utkast',
          short_id: 'lk000002',
          scheduled_tee_off_at: null,
          registration_mode: 'open',
          status: 'draft',
          signups_closed_at: null,
          courses: null,
        },
        {
          id: 'leak-active',
          name: 'I gang',
          short_id: 'lk000003',
          scheduled_tee_off_at: null,
          registration_mode: 'open',
          status: 'active',
          signups_closed_at: null,
          courses: null,
        },
        {
          id: 'leak-closed',
          name: 'Stengt',
          short_id: 'lk000004',
          scheduled_tee_off_at: null,
          registration_mode: 'open',
          status: 'scheduled',
          signups_closed_at: '2026-07-01T10:00:00Z',
          courses: null,
        },
      ],
    });

    const { getPublicDiscoverableGames } = await import(
      './getPublicDiscoverableGames'
    );
    const result = await getPublicDiscoverableGames();
    expect(result.map((g) => g.id)).toEqual(['ok-open', 'ok-manual']);
  });
});
