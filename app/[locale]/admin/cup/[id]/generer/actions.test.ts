import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  buildSupabaseMock,
  makeRedirectMock,
  RedirectError,
} from '@/tests/serverActionMocks';
import { generateSplitDayPlan, type PlannedMatch } from '@/lib/cup/cupPairing';
import type { CupBatchMatch } from './actions';

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
// #1441: adminCupCreatedBy supports requireAdminOrTournamentCreator's
// created_by check — needed to reach the non-admin personal-cup cap-check
// branch in createCupMatchesFromPlan (default null keeps the existing
// non-admin-redirects-to-/ tests unchanged: created_by null never matches a
// real userId).
let adminCupGroupId: string | null = null;
let adminMemberIds: string[] = [];
let adminCupCreatedBy: string | null = null;
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
      // tournaments group_id/created_by lookup (gate). #1441: the personal-
      // cup cap-check's admin-client `games`/`game_players` count queries
      // (no `.maybeSingle()`) also land in this generic branch — they await
      // a non-thenable `{maybeSingle}` object, which resolves to itself; the
      // destructured `data` is then `undefined` and the cap-check code falls
      // back to `[]` via `?? []`. That's fine for a cap test that trips the
      // cap on NEW matches alone (no simulated pre-existing games).
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: { group_id: adminCupGroupId, created_by: adminCupCreatedBy },
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
  adminCupCreatedBy = null;
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
          { id: 'A1', gender: 'mens' },
          { id: 'A2', gender: 'mens' },
          { id: 'A3', gender: 'ladies' },
          { id: 'B1', gender: 'mens' },
          { id: 'B2', gender: 'mens' },
          { id: 'B3', gender: 'mens' },
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

  // #641: the insert previously set `status: 'active'` — a column game_players
  // does not have — so PostgREST rejected every match's player insert and cup
  // generation created 0 players. It also set team_number without
  // flight_number, which trips game_players_team_flight_consistency. The
  // corrected payload: no `status`, flight_number 1 (one match = one group),
  // team_number 1/2, accepted_at set (admin-generated = immediately active).
  it('game_players rows: no status column, flight_number 1, team_number 1/2, accepted, tee_gender', async () => {
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
    // The non-existent `status` column must never be sent again.
    expect(firstPlayers.every((r) => !('status' in r))).toBe(true);
    // flight_number satisfies team_flight_consistency for team_number 1/2.
    expect(firstPlayers.every((r) => r.flight_number === 1)).toBe(true);
    // Admin-generated → immediately active (accepted_at is a non-null ISO string).
    expect(firstPlayers.every((r) => typeof r.accepted_at === 'string')).toBe(true);
    expect(firstPlayers.every((r) => r.game_id === 'game-1')).toBe(true);
    const a1 = firstPlayers.find((r) => r.user_id === 'A1')!;
    expect(a1.team_number).toBe(1);
    expect(a1.tee_gender).toBe('mens');
    const b1IsTeam2 = firstPlayers.find((r) => r.user_id === 'B1')!;
    expect(b1IsTeam2.team_number).toBe(2);
    // #1053: the ladies-fixture player (A3, match 2) must get the ladies tee —
    // teeGenderOf compared against 'female' (a value user_gender never had)
    // and silently mapped every player to 'mens'.
    const allPlayers = supabaseMock.__fromCalls
      .filter((c) => c.table === 'game_players' && c.method === 'insert')
      .flatMap((c) => c.args[0] as Array<Record<string, unknown>>);
    expect(allPlayers.find((r) => r.user_id === 'A3')?.tee_gender).toBe('ladies');
  });
});

describe('createCupMatchesFromPlan — klubb-cup (#524)', () => {
  const genderRows = [
    { id: 'A1', gender: 'mens' },
    { id: 'A2', gender: 'mens' },
    { id: 'A3', gender: 'ladies' },
    { id: 'B1', gender: 'mens' },
    { id: 'B2', gender: 'mens' },
    { id: 'B3', gender: 'mens' },
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

describe('createCupMatchesFromPlan — rollback on mid-loop failure (#675)', () => {
  const genderRows = [
    { id: 'A1', gender: 'mens' },
    { id: 'A2', gender: 'mens' },
    { id: 'A3', gender: 'ladies' },
    { id: 'B1', gender: 'mens' },
    { id: 'B2', gender: 'mens' },
    { id: 'B3', gender: 'mens' },
  ];

  it('game_players insert fails on match 2: deletes ALL accumulated games, returns insert_failed', async () => {
    supabaseMock = buildSupabaseMock([
      { data: { is_admin: true }, error: null }, // requireAdmin
      { data: draftCup, error: null }, // tournament gate
      { data: genderRows, error: null }, // tee_gender roster
      { data: { id: 'game-1' }, error: null }, // match 1 game insert
      { data: null, error: null }, // match 1 game_players insert OK
      { data: { id: 'game-2' }, error: null }, // match 2 game insert
      { data: null, error: { message: 'boom' } }, // match 2 game_players insert FAILS
      { data: null, error: null }, // rollback: games.delete().in(...)
    ]);
    setUser('admin-1');
    const { createCupMatchesFromPlan } = await import('./actions');

    expect(await createCupMatchesFromPlan(baseInput())).toEqual({
      error: 'insert_failed',
    });

    // The orphan-prevention: every game row inserted so far is deleted (the
    // game_players rows follow via FK cascade), not left as a half-built cup.
    const deleteCall = supabaseMock.__fromCalls.find(
      (c) => c.table === 'games' && c.method === 'delete',
    );
    expect(deleteCall, 'games.delete issued for rollback').toBeDefined();
    const inCall = supabaseMock.__fromCalls.find(
      (c) => c.table === 'games' && c.method === 'in',
    );
    expect(inCall!.args).toEqual(['id', ['game-1', 'game-2']]);
  });
});

// #1441 (F3b): splittet-cup-dag-bunten — to-pass insert (host FØR avledet),
// segment/reveal/source-kolonner, best_ball-mode_config, og
// team_strokes_override-forwarding for greensome.
describe('createCupMatchesFromPlan — splittet cup-dag to-pass insert (#1441)', () => {
  const flightGenderRows = [
    { id: 'p1', gender: 'mens' },
    { id: 'p2', gender: 'mens' },
    { id: 'p3', gender: 'mens' },
    { id: 'p4', gender: 'mens' },
  ];

  it('host-pass (greensome+best_ball) fullfører før avledet-pass (2 singles); source_game_id mapper til det INNSATTE host-id-et, ikke plan-id-en', async () => {
    // Ekte plan fra F3a-generatoren (#1441, D4) — kryssjekker F3a↔F3b-
    // kontrakten i stedet for en håndbygd fixture. 'handicap'-strategien er
    // deterministisk (ingen rng nødvendig).
    const bundle = generateSplitDayPlan({
      team1: [
        { userId: 'p1', name: 'P1', hcpIndex: 5 },
        { userId: 'p2', name: 'P2', hcpIndex: 10 },
      ],
      team2: [
        { userId: 'p3', name: 'P3', hcpIndex: 6 },
        { userId: 'p4', name: 'P4', hcpIndex: 11 },
      ],
      strategy: 'handicap',
    });
    expect(bundle.map((m) => m.id)).toEqual([
      'greensome_matchplay-1',
      'best_ball-1',
      'singles_matchplay-1',
      'singles_matchplay-2',
    ]);

    supabaseMock = buildSupabaseMock([
      { data: { is_admin: true }, error: null }, // requireAdmin
      { data: draftCup, error: null }, // tournament gate (fourball 85, greensome unset → default 100)
      { data: flightGenderRows, error: null }, // tee_gender roster
      { data: { id: 'game-greensome' }, error: null }, // pass 1: greensome host insert
      { data: null, error: null }, // greensome game_players OK
      { data: { id: 'game-bestball' }, error: null }, // pass 1: best_ball host insert
      { data: null, error: null }, // best_ball game_players OK
      { data: { id: 'game-singles1' }, error: null }, // pass 2: derived singles 1 insert
      { data: null, error: null }, // singles1 game_players OK
      { data: { id: 'game-singles2' }, error: null }, // pass 2: derived singles 2 insert
      { data: null, error: null }, // singles2 game_players OK
    ]);
    setUser('admin-1');
    const { createCupMatchesFromPlan } = await import('./actions');

    await expect(
      createCupMatchesFromPlan({
        tournamentId: 'cup-1',
        courseId: 'course-1',
        teeBoxId: 'tee-1',
        matches: bundle,
      }),
    ).rejects.toBeInstanceOf(RedirectError);

    const gameInserts = supabaseMock.__fromCalls.filter(
      (c) => c.table === 'games' && c.method === 'insert',
    );
    expect(gameInserts).toHaveLength(4);

    // Pass-rekkefølge: begge host-ene (uten sourceId) FØR begge avledede.
    const rows = gameInserts.map((c) => c.args[0] as Record<string, unknown>);
    const [greensomeRow, bestBallRow, singles1Row, singles2Row] = rows;

    expect(greensomeRow.hole_segment).toBe('front9');
    expect(greensomeRow.score_visibility).toBe('reveal');
    expect(greensomeRow.source_game_id).toBeUndefined();
    expect(greensomeRow.mode_config).toEqual({
      kind: 'greensome_matchplay',
      team_size: 2,
      teams_count: 2,
      allowance_pct: 100, // ALLOWANCE_DEFAULTS.greensome — draftCup fixture has no override
    });

    expect(bestBallRow.hole_segment).toBe('back9');
    expect(bestBallRow.score_visibility).toBe('reveal');
    expect(bestBallRow.source_game_id).toBeUndefined();
    expect(bestBallRow.mode_config).toEqual({
      kind: 'best_ball',
      team_size: 2,
      teams_count: 2,
      allowance_pct: 85, // reuses draftCup's fourball_allowance_pct (D4/D11 ASSUMPTION)
    });

    // #1441 (D3): kjernebeviset — source_game_id peker på det VIRKELIG
    // innsatte host-id-et ('game-bestball'), ikke plan-lokale 'best_ball-1'.
    expect(singles1Row.hole_segment).toBe('back9');
    expect(singles1Row.score_visibility).toBe('reveal');
    expect(singles1Row.source_game_id).toBe('game-bestball');
    expect(singles1Row.mode_config).toEqual({ kind: 'singles_matchplay', team_size: 1 });

    expect(singles2Row.source_game_id).toBe('game-bestball');
  });

  it('greensome med teamStrokesOverride: forwardes til mode_config.team_strokes_override', async () => {
    const match: CupBatchMatch = {
      id: 'greensome_matchplay-1',
      format: 'greensome_matchplay',
      label: 'Greensome 1',
      side1: ['p1', 'p2'],
      side2: ['p3', 'p4'],
      segment: 'front9',
      flightIndex: 1,
      teamStrokesOverride: { team1: 5, team2: 0 },
    };
    supabaseMock = buildSupabaseMock([
      { data: { is_admin: true }, error: null },
      { data: draftCup, error: null },
      { data: flightGenderRows, error: null },
      { data: { id: 'game-greensome' }, error: null },
      { data: null, error: null },
    ]);
    setUser('admin-1');
    const { createCupMatchesFromPlan } = await import('./actions');

    await expect(
      createCupMatchesFromPlan({
        tournamentId: 'cup-1',
        courseId: 'course-1',
        teeBoxId: 'tee-1',
        matches: [match],
      }),
    ).rejects.toBeInstanceOf(RedirectError);

    const row = supabaseMock.__fromCalls.find(
      (c) => c.table === 'games' && c.method === 'insert',
    )!.args[0] as Record<string, unknown>;
    expect(row.mode_config).toEqual({
      kind: 'greensome_matchplay',
      team_size: 2,
      teams_count: 2,
      allowance_pct: 100,
      team_strokes_override: { team1: 5, team2: 0 },
    });
  });
});

describe('createCupMatchesFromPlan — ordinære preset-matcher beholder dagens kolonner (#1441 regresjon)', () => {
  it('hole_segment eksplisitt "full"; score_visibility UTELATES (arver DB-default \'live\')', async () => {
    const genderRows = [
      { id: 'A1', gender: 'mens' },
      { id: 'A2', gender: 'mens' },
      { id: 'B1', gender: 'mens' },
      { id: 'B2', gender: 'mens' },
    ];
    supabaseMock = buildSupabaseMock([
      { data: { is_admin: true }, error: null },
      { data: draftCup, error: null },
      { data: genderRows, error: null },
      { data: { id: 'game-1' }, error: null },
      { data: null, error: null },
    ]);
    setUser('admin-1');
    const { createCupMatchesFromPlan } = await import('./actions');
    const match: PlannedMatch = {
      id: 'fourball_matchplay-1',
      format: 'fourball_matchplay',
      label: 'Four-ball 1',
      side1: ['A1', 'A2'],
      side2: ['B1', 'B2'],
    };

    await expect(
      createCupMatchesFromPlan({
        tournamentId: 'cup-1',
        courseId: 'course-1',
        teeBoxId: 'tee-1',
        matches: [match],
      }),
    ).rejects.toBeInstanceOf(RedirectError);

    const row = supabaseMock.__fromCalls.find(
      (c) => c.table === 'games' && c.method === 'insert',
    )!.args[0] as Record<string, unknown>;
    expect(row.hole_segment).toBe('full');
    expect('score_visibility' in row).toBe(false);
    expect('source_game_id' in row).toBe(false);
  });
});

describe('createCupMatchesFromPlan — team_strokes_override-validering (#1441, D10)', () => {
  it('negativt tall: invalid_team_strokes_override FØR noe insertes', async () => {
    supabaseMock = buildSupabaseMock([{ data: { is_admin: true }, error: null }]);
    setUser('admin-1');
    const { createCupMatchesFromPlan } = await import('./actions');
    const match: CupBatchMatch = {
      id: 'greensome_matchplay-1',
      format: 'greensome_matchplay',
      label: 'Greensome 1',
      side1: ['A1', 'A2'],
      side2: ['B1', 'B2'],
      teamStrokesOverride: { team1: -1, team2: 0 },
    };

    expect(
      await createCupMatchesFromPlan({
        tournamentId: 'cup-1',
        courseId: 'course-1',
        teeBoxId: 'tee-1',
        matches: [match],
      }),
    ).toEqual({ error: 'invalid_team_strokes_override' });
    expect(
      supabaseMock.__fromCalls.some((c) => c.table === 'tournaments'),
    ).toBe(false);
  });

  it('kun team1 satt (team2 mangler): invalid_team_strokes_override — «begge eller ingen»', async () => {
    supabaseMock = buildSupabaseMock([{ data: { is_admin: true }, error: null }]);
    setUser('admin-1');
    const { createCupMatchesFromPlan } = await import('./actions');
    const match = {
      id: 'greensome_matchplay-1',
      format: 'greensome_matchplay',
      label: 'Greensome 1',
      side1: ['A1', 'A2'],
      side2: ['B1', 'B2'],
      teamStrokesOverride: { team1: 5 },
    } as unknown as CupBatchMatch;

    expect(
      await createCupMatchesFromPlan({
        tournamentId: 'cup-1',
        courseId: 'course-1',
        teeBoxId: 'tee-1',
        matches: [match],
      }),
    ).toEqual({ error: 'invalid_team_strokes_override' });
  });

  it('ikke-heltall (2.5): invalid_team_strokes_override', async () => {
    supabaseMock = buildSupabaseMock([{ data: { is_admin: true }, error: null }]);
    setUser('admin-1');
    const { createCupMatchesFromPlan } = await import('./actions');
    const match: CupBatchMatch = {
      id: 'greensome_matchplay-1',
      format: 'greensome_matchplay',
      label: 'Greensome 1',
      side1: ['A1', 'A2'],
      side2: ['B1', 'B2'],
      teamStrokesOverride: { team1: 2.5, team2: 0 },
    };

    expect(
      await createCupMatchesFromPlan({
        tournamentId: 'cup-1',
        courseId: 'course-1',
        teeBoxId: 'tee-1',
        matches: [match],
      }),
    ).toEqual({ error: 'invalid_team_strokes_override' });
  });
});

describe('createCupMatchesFromPlan — ugyldig sourceId (#1441, D3)', () => {
  it('sourceId matcher ingen host-match i planen: invalid_source_match FØR noe insertes', async () => {
    supabaseMock = buildSupabaseMock([{ data: { is_admin: true }, error: null }]);
    setUser('admin-1');
    const { createCupMatchesFromPlan } = await import('./actions');
    const match: PlannedMatch = {
      id: 'singles_matchplay-1',
      format: 'singles_matchplay',
      label: 'Singel 1',
      side1: ['A1'],
      side2: ['B1'],
      sourceId: 'does-not-exist',
    };

    expect(
      await createCupMatchesFromPlan({
        tournamentId: 'cup-1',
        courseId: 'course-1',
        teeBoxId: 'tee-1',
        matches: [match],
      }),
    ).toEqual({ error: 'invalid_source_match' });
    expect(
      supabaseMock.__fromCalls.some((c) => c.table === 'tournaments'),
    ).toBe(false);
  });
});

describe('createCupMatchesFromPlan — rollback dekker pass 2 (#1441, D3/#675)', () => {
  it('avledet match sin game_players-insert feiler: ruller tilbake BÅDE host- og avledet-spillet', async () => {
    const genderRows = [
      { id: 'p1', gender: 'mens' },
      { id: 'p3', gender: 'mens' },
    ];
    supabaseMock = buildSupabaseMock([
      { data: { is_admin: true }, error: null }, // requireAdmin
      { data: draftCup, error: null }, // tournament gate
      { data: genderRows, error: null }, // tee_gender roster
      { data: { id: 'game-host' }, error: null }, // host insert OK
      { data: null, error: null }, // host game_players OK
      { data: { id: 'game-derived' }, error: null }, // derived insert OK
      { data: null, error: { message: 'boom' } }, // derived game_players FAILS
      { data: null, error: null }, // rollback: games.delete().in(...)
    ]);
    setUser('admin-1');
    const { createCupMatchesFromPlan } = await import('./actions');
    const matches: CupBatchMatch[] = [
      {
        id: 'best_ball-1',
        format: 'best_ball',
        label: 'Best ball 1',
        side1: ['p1'],
        side2: ['p3'],
        segment: 'back9',
        flightIndex: 1,
      },
      {
        id: 'singles_matchplay-1',
        format: 'singles_matchplay',
        label: 'Singel 1',
        side1: ['p1'],
        side2: ['p3'],
        segment: 'back9',
        sourceId: 'best_ball-1',
      },
    ];

    expect(
      await createCupMatchesFromPlan({
        tournamentId: 'cup-1',
        courseId: 'course-1',
        teeBoxId: 'tee-1',
        matches,
      }),
    ).toEqual({ error: 'insert_failed' });

    const inCall = supabaseMock.__fromCalls.find(
      (c) => c.table === 'games' && c.method === 'in',
    );
    // Begge — host OG avledet — sendes til rollback-sletting (#675-mønsteret
    // dekker nå pass 2, ikke bare pass 1).
    expect(inCall!.args).toEqual(['id', ['game-host', 'game-derived']]);
  });
});

describe('createCupMatchesFromPlan — personlig-cup-taket teller avledede matcher (#1441, D5)', () => {
  it('6 host + 12 avledet (18 matcher totalt) alene overskrider taket (16): too_many_matches, ingen insert', async () => {
    adminCupCreatedBy = 'user-1'; // ikke-admin passerer som cupens egen skaper
    supabaseMock = buildSupabaseMock([
      { data: { is_admin: false }, error: null }, // requireAdmin (loadRole)
      { data: draftCup, error: null }, // tournament gate (group_id mangler → frittstående)
    ]);
    setUser('user-1');
    const { createCupMatchesFromPlan } = await import('./actions');

    const hosts: CupBatchMatch[] = Array.from({ length: 6 }, (_, i) => ({
      id: `best_ball-${i + 1}`,
      format: 'best_ball',
      label: `Best ball ${i + 1}`,
      side1: [`A${i}1`, `A${i}2`],
      side2: [`B${i}1`, `B${i}2`],
      segment: 'back9',
      flightIndex: i + 1,
    }));
    const derived: CupBatchMatch[] = hosts.flatMap((h, i) => [
      {
        id: `singles_matchplay-${i * 2 + 1}`,
        format: 'singles_matchplay' as const,
        label: `Singel ${i * 2 + 1}`,
        side1: [`A${i}1`],
        side2: [`B${i}1`],
        sourceId: h.id,
      },
      {
        id: `singles_matchplay-${i * 2 + 2}`,
        format: 'singles_matchplay' as const,
        label: `Singel ${i * 2 + 2}`,
        side1: [`A${i}2`],
        side2: [`B${i}2`],
        sourceId: h.id,
      },
    ]);
    const matches = [...hosts, ...derived];
    expect(matches).toHaveLength(18); // 6 host + 12 avledet — kun host-ene (6) ville vært under taket

    expect(
      await createCupMatchesFromPlan({
        tournamentId: 'cup-1',
        courseId: 'course-1',
        teeBoxId: 'tee-1',
        matches,
      }),
    ).toEqual({ error: 'too_many_matches' });
    expect(
      supabaseMock.__fromCalls.some((c) => c.table === 'games' && c.method === 'insert'),
    ).toBe(false);
  });
});
