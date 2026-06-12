import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  buildSupabaseMock,
  makeRedirectMock,
  RedirectError,
} from '@/tests/serverActionMocks';
import type { PlannedMatch } from '@/lib/cup/cupPairing';

/**
 * Unit tests for createCupMatchesFromPlan — the batch cup-match creator (#219).
 *
 * DB sequence for the happy path (N matches):
 *   1. requireAdmin → auth.getUser + users.select(is_admin…).eq.single
 *   2. tournaments.select(...).eq.maybeSingle — status gate + allowance defaults
 *   3. users.select('id,gender').in(ids) — tee_gender lookup (awaited builder)
 *   4. per match: games.insert(...).select('id').single, then game_players.insert
 *   5. redirect
 */

const redirectMock = makeRedirectMock();
vi.mock('@/i18n/navigation', () => ({
  redirect: ({ href }: { href: string }) => redirectMock(href),
}));
// requireAdminOrClubAdminOfCup (lib/admin/auth) still redirects via
// next/navigation — both mocks must feed the same redirectMock.
vi.mock('next/navigation', () => ({
  redirect: (url: string) => redirectMock(url),
}));
vi.mock('next-intl/server', () => ({
  getLocale: async () => 'no',
}));

vi.mock('next/cache', () => ({
  revalidateTag: vi.fn(),
  revalidatePath: vi.fn(),
}));

let supabaseMock: ReturnType<typeof buildSupabaseMock>;
vi.mock('@/lib/supabase/server', () => ({
  getServerClient: async () => supabaseMock,
}));

// #524: the gate (requireAdminOrClubAdminOfCup) + member-guardrail use the admin
// client. Default group_id=null → frittstående (gate falls to requireAdmin on the
// request-scoped mock, unchanged). Set adminCupGroupId to exercise the club path.
let adminCupGroupId: string | null = null;
let adminMemberIds: string[] = [];
vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => ({
    from: (table: string) => {
      if (table === 'group_members') {
        return {
          select: () => ({
            eq: async () => ({
              data: adminMemberIds.map((id) => ({ user_id: id })),
              error: null,
            }),
          }),
        };
      }
      // tournaments group_id lookup (gate)
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: { group_id: adminCupGroupId },
              error: null,
            }),
          }),
        }),
      };
    },
  }),
}));

function setUser(id: string | null) {
  (supabaseMock.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
    data: { user: id ? { id, email: `${id}@x.no` } : null },
  });
}

function lastRedirect(): string | undefined {
  return redirectMock.mock.calls.at(-1)?.[0];
}

function plan(): PlannedMatch[] {
  return [
    {
      id: 'foursomes_matchplay-1',
      format: 'foursomes_matchplay',
      label: 'Foursome 1',
      side1: ['A1', 'A2'],
      side2: ['B1', 'B2'],
    },
    {
      id: 'singles_matchplay-1',
      format: 'singles_matchplay',
      label: 'Singel 1',
      side1: ['A3'],
      side2: ['B3'],
    },
  ];
}

const baseInput = () => ({
  tournamentId: 'cup-1',
  courseId: 'course-1',
  teeBoxId: 'tee-1',
  matches: plan(),
});

const draftCup = {
  name: 'Tørny Cup',
  status: 'draft',
  fourball_allowance_pct: 85,
  foursomes_allowance_pct: 50,
};

beforeEach(() => {
  vi.clearAllMocks();
  adminCupGroupId = null;
  adminMemberIds = [];
});

describe('createCupMatchesFromPlan — authz', () => {
  it('non-admin: redirects to / (requireAdmin gate)', async () => {
    supabaseMock = buildSupabaseMock([{ data: { is_admin: false }, error: null }]);
    setUser('user-1');
    const { createCupMatchesFromPlan } = await import('./actions');
    await expect(createCupMatchesFromPlan(baseInput())).rejects.toBeInstanceOf(
      RedirectError,
    );
    expect(lastRedirect()).toBe('/');
  });

  it('not logged in: redirects to /login', async () => {
    supabaseMock = buildSupabaseMock([]);
    setUser(null);
    const { createCupMatchesFromPlan } = await import('./actions');
    await expect(createCupMatchesFromPlan(baseInput())).rejects.toBeInstanceOf(
      RedirectError,
    );
    expect(lastRedirect()).toBe('/login');
  });
});

describe('createCupMatchesFromPlan — status gate', () => {
  it('non-draft cup: returns { error: not_draft } without inserting', async () => {
    supabaseMock = buildSupabaseMock([
      { data: { is_admin: true }, error: null },
      { data: { ...draftCup, status: 'active' }, error: null },
    ]);
    setUser('admin-1');
    const { createCupMatchesFromPlan } = await import('./actions');
    expect(await createCupMatchesFromPlan(baseInput())).toEqual({
      error: 'not_draft',
    });
    expect(
      supabaseMock.__fromCalls.some(
        (c) => c.table === 'games' && c.method === 'insert',
      ),
    ).toBe(false);
  });

  it('missing tournament: returns { error: not_found }', async () => {
    supabaseMock = buildSupabaseMock([
      { data: { is_admin: true }, error: null },
      { data: null, error: null },
    ]);
    setUser('admin-1');
    const { createCupMatchesFromPlan } = await import('./actions');
    expect(await createCupMatchesFromPlan(baseInput())).toEqual({
      error: 'not_found',
    });
  });

  it('empty plan: returns { error: no_matches }', async () => {
    supabaseMock = buildSupabaseMock([{ data: { is_admin: true }, error: null }]);
    setUser('admin-1');
    const { createCupMatchesFromPlan } = await import('./actions');
    expect(
      await createCupMatchesFromPlan({ ...baseInput(), matches: [] }),
    ).toEqual({ error: 'no_matches' });
  });
});

describe('createCupMatchesFromPlan — happy path', () => {
  function happyQueue() {
    return [
      { data: { is_admin: true }, error: null },
      { data: draftCup, error: null },
      {
        data: [
          { id: 'A1', gender: 'male' },
          { id: 'A2', gender: 'male' },
          { id: 'A3', gender: 'female' },
          { id: 'B1', gender: 'male' },
          { id: 'B2', gender: 'male' },
          { id: 'B3', gender: 'male' },
        ],
        error: null,
      },
      { data: { id: 'game-1' }, error: null },
      { data: null, error: null },
      { data: { id: 'game-2' }, error: null },
      { data: null, error: null },
    ];
  }

  it('inserts one game + game_players per match, then redirects', async () => {
    supabaseMock = buildSupabaseMock(happyQueue());
    setUser('admin-1');
    const { createCupMatchesFromPlan } = await import('./actions');
    await expect(createCupMatchesFromPlan(baseInput())).rejects.toBeInstanceOf(
      RedirectError,
    );
    expect(lastRedirect()).toBe('/admin/cup/cup-1?status=matches_generated');

    expect(
      supabaseMock.__fromCalls.filter(
        (c) => c.table === 'games' && c.method === 'insert',
      ),
    ).toHaveLength(2);
    expect(
      supabaseMock.__fromCalls.filter(
        (c) => c.table === 'game_players' && c.method === 'insert',
      ),
    ).toHaveLength(2);
  });

  it('first match game row: scheduled status, format, label, mode_config + cup FK', async () => {
    supabaseMock = buildSupabaseMock(happyQueue());
    setUser('admin-1');
    const { createCupMatchesFromPlan } = await import('./actions');
    await expect(createCupMatchesFromPlan(baseInput())).rejects.toBeInstanceOf(
      RedirectError,
    );

    const firstGame = supabaseMock.__fromCalls.find(
      (c) => c.table === 'games' && c.method === 'insert',
    )!.args[0] as Record<string, unknown>;
    expect(firstGame.status).toBe('scheduled');
    expect(firstGame.game_mode).toBe('foursomes_matchplay');
    expect(firstGame.tournament_id).toBe('cup-1');
    expect(firstGame.tournament_match_label).toBe('Foursome 1');
    expect(firstGame.created_by).toBe('admin-1');
    expect(firstGame.course_id).toBe('course-1');
    expect(firstGame.tee_box_id).toBe('tee-1');
    expect(firstGame.mode_config).toEqual({
      kind: 'foursomes_matchplay',
      team_size: 2,
      teams_count: 2,
      allowance_pct: 50,
    });
  });

  it('singles match game row: mode_config has no allowance', async () => {
    supabaseMock = buildSupabaseMock(happyQueue());
    setUser('admin-1');
    const { createCupMatchesFromPlan } = await import('./actions');
    await expect(createCupMatchesFromPlan(baseInput())).rejects.toBeInstanceOf(
      RedirectError,
    );

    const singlesGame = supabaseMock.__fromCalls
      .filter((c) => c.table === 'games' && c.method === 'insert')
      .map((c) => c.args[0] as Record<string, unknown>)
      .find((row) => row.game_mode === 'singles_matchplay')!;
    expect(singlesGame.mode_config).toEqual({
      kind: 'singles_matchplay',
      team_size: 1,
    });
  });

  it('game_players rows: team_number 1/2, status active, tee_gender from profile', async () => {
    supabaseMock = buildSupabaseMock(happyQueue());
    setUser('admin-1');
    const { createCupMatchesFromPlan } = await import('./actions');
    await expect(createCupMatchesFromPlan(baseInput())).rejects.toBeInstanceOf(
      RedirectError,
    );

    const firstPlayers = supabaseMock.__fromCalls.find(
      (c) => c.table === 'game_players' && c.method === 'insert',
    )!.args[0] as Array<Record<string, unknown>>;
    expect(firstPlayers).toHaveLength(4);
    expect(firstPlayers.every((r) => r.status === 'active')).toBe(true);
    expect(firstPlayers.every((r) => r.game_id === 'game-1')).toBe(true);
    const a1 = firstPlayers.find((r) => r.user_id === 'A1')!;
    expect(a1.team_number).toBe(1);
    expect(a1.tee_gender).toBe('mens');
    const b3IsTeam2 = firstPlayers.find((r) => r.user_id === 'B1')!;
    expect(b3IsTeam2.team_number).toBe(2);
    // A3 is female in match 2 (singles); first match has A1/A2/B1/B2 all male
    expect(a1.tee_gender).toBe('mens');
  });
});

describe('createCupMatchesFromPlan — klubb-cup (#524)', () => {
  const genderRows = [
    { id: 'A1', gender: 'male' },
    { id: 'A2', gender: 'male' },
    { id: 'A3', gender: 'female' },
    { id: 'B1', gender: 'male' },
    { id: 'B2', gender: 'male' },
    { id: 'B3', gender: 'male' },
  ];

  it('club cup, all players members: games get group_id + redirects to klubb-route', async () => {
    adminCupGroupId = 'club-1';
    adminMemberIds = ['A1', 'A2', 'A3', 'B1', 'B2', 'B3'];
    supabaseMock = buildSupabaseMock([
      { data: { is_admin: true }, error: null },
      { data: { ...draftCup, group_id: 'club-1' }, error: null },
      { data: genderRows, error: null },
      { data: { id: 'game-1' }, error: null },
      { data: null, error: null },
      { data: { id: 'game-2' }, error: null },
      { data: null, error: null },
    ]);
    setUser('admin-1');
    const { createCupMatchesFromPlan } = await import('./actions');
    await expect(createCupMatchesFromPlan(baseInput())).rejects.toBeInstanceOf(
      RedirectError,
    );
    expect(lastRedirect()).toBe(
      '/klubber/club-1/cup/cup-1?status=matches_generated',
    );
    const firstGame = supabaseMock.__fromCalls.find(
      (c) => c.table === 'games' && c.method === 'insert',
    )!.args[0] as Record<string, unknown>;
    expect(firstGame.group_id).toBe('club-1');
  });

  it('club cup, a player is not a member: returns { error: not_members } without inserting', async () => {
    adminCupGroupId = 'club-1';
    adminMemberIds = ['A1', 'A2', 'A3', 'B1', 'B2']; // B3 mangler
    supabaseMock = buildSupabaseMock([
      { data: { is_admin: true }, error: null },
      { data: { ...draftCup, group_id: 'club-1' }, error: null },
    ]);
    setUser('admin-1');
    const { createCupMatchesFromPlan } = await import('./actions');
    expect(await createCupMatchesFromPlan(baseInput())).toEqual({
      error: 'not_members',
    });
    expect(
      supabaseMock.__fromCalls.some(
        (c) => c.table === 'games' && c.method === 'insert',
      ),
    ).toBe(false);
  });
});
