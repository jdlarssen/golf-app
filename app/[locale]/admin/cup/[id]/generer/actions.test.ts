import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  buildSupabaseMock,
  makeRedirectMock,
  RedirectError,
} from '@/tests/serverActionMocks';
import { generateSplitDayPlan, type PlannedMatch } from '@/lib/cup/cupPairing';
import type { CupBatchMatch } from './actions';

/**
 * Unit tests for createCupMatchesFromPlan — the batch cup-match creator (#219,
 * #1472).
 *
 * #1472: bane/tee/tee-off/best-ball leses server-side fra den LAGREDE planen
 * (`tournament_plans`), ikke lenger fra klient-payloaden. Input er nå kun
 * `{ tournamentId, matches }`.
 *
 * DB sequence for the happy path (N matches), all via the request client:
 *   1. requireAdmin → auth.getUser + users.select(is_admin…).single
 *   2. tournaments.select(...).eq.maybeSingle — status gate + allowance defaults
 *   3. tournament_plans.select(...).eq.maybeSingle — bane/tee/tee-off/best-ball
 *   4. tee_boxes.select(...).eq.maybeSingle — re-valider tee mot bane + arkivert
 *   5. per match: games.insert(...).select('id').single, then game_players.insert
 *   6. redirect
 *
 * #1628: roster-lesingen (`users.select('id, gender, hcp_index')`) ligger IKKE
 * lenger i denne køen — den går via admin-klienten (se `adminUserRows`).
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
// #1628: roster-lesingen (tee_gender + hcp_index) flyttet fra request-klienten
// til admin-klienten — `hcp_index` er input til greensomens auto-forslag, og en
// klubb-admin ser ikke fremmede users-rader under RLS. Defaulten dekker alle
// fikstur-spillerne i fila (A1–B3 + p1–p4); tester som bryr seg om tallene
// setter `adminUserRows` selv.
type AdminUserRow = { id: string; gender: string | null; hcp_index: number };
const DEFAULT_USER_ROWS: AdminUserRow[] = [
  { id: 'A1', gender: 'mens', hcp_index: 10 },
  { id: 'A2', gender: 'mens', hcp_index: 10 },
  { id: 'A3', gender: 'ladies', hcp_index: 10 },
  { id: 'B1', gender: 'mens', hcp_index: 10 },
  { id: 'B2', gender: 'mens', hcp_index: 10 },
  { id: 'B3', gender: 'mens', hcp_index: 10 },
  { id: 'p1', gender: 'mens', hcp_index: 5 },
  { id: 'p2', gender: 'mens', hcp_index: 10 },
  { id: 'p3', gender: 'mens', hcp_index: 6 },
  { id: 'p4', gender: 'mens', hcp_index: 11 },
];

let adminCupGroupId: string | null = null;
let adminMemberIds: string[] = [];
let adminCupCreatedBy: string | null = null;
let adminUserRows: AdminUserRow[] = DEFAULT_USER_ROWS;
// #1718: lesefeilen på profilene skal stoppe genereringen. Mutabel så én test
// kan bryte nettopp det kallet; default null holder alle andre tester uendret.
let adminUserRowsError: unknown = null;
// #1810: cap-vakta i den personlige ikke-admin-grenen teller eksisterende
// matcher (`games`) og deltakere (`game_players`) via admin-klienten. De to
// lesingene trengte egne grener for å (a) kunne returnere rader og (b) ha en
// error-kanal — den generiske fallback-en under har ingen av delene, og
// `game_players`-lesingen bruker `.in()`, som fallback-en ikke tilbyr.
// Defaultene (tomme rader, ingen feil) matcher det fallback-en effektivt ga
// (`data` undefined → `?? []`), så eksisterende tester er uendret.
let adminExistingGameRows: { id: string }[] = [];
let adminExistingGamesError: unknown = null;
let adminExistingPlayerRows: { user_id: string }[] = [];
let adminExistingPlayersError: unknown = null;
vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => ({
    from: (table: string) => {
      if (table === 'games') {
        return {
          select: () => ({
            eq: async () => ({
              data: adminExistingGamesError ? null : adminExistingGameRows,
              error: adminExistingGamesError,
            }),
          }),
        };
      }
      if (table === 'game_players') {
        return {
          select: () => ({
            in: async () => ({
              data: adminExistingPlayersError ? null : adminExistingPlayerRows,
              error: adminExistingPlayersError,
            }),
          }),
        };
      }
      if (table === 'users') {
        return {
          select: () => ({
            in: async () => ({
              data: adminUserRowsError ? null : adminUserRows,
              error: adminUserRowsError,
            }),
          }),
        };
      }
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
      // cup cap-check's `games`/`game_players` count queries used to land here
      // too; #1810 gave them dedicated branches above (rows + error channel).
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

// #1472: input er kun cup-id + matcher (bane/tee/tee-off/best-ball leses fra
// planen server-side).
const baseInput = () => ({
  tournamentId: 'cup-1',
  matches: plan(),
});

const draftCup = {
  name: 'Tørny Cup',
  status: 'draft',
  fourball_allowance_pct: 85,
  foursomes_allowance_pct: 50,
};

// #1472: den lagrede planens rad. Bane/tee 'course-1'/'tee-1' matcher det de
// gamle testene sendte som input; tee-off/best-ball default NULL.
const planResult = (
  overrides: Partial<{
    course_id: string | null;
    tee_box_id: string | null;
    scheduled_tee_off_at: string | null;
    best_ball_allowance_pct: number | null;
  }> = {},
) => ({
  data: {
    course_id: 'course-1',
    tee_box_id: 'tee-1',
    scheduled_tee_off_at: null,
    best_ball_allowance_pct: null,
    ...overrides,
  },
  error: null,
});

// tee_boxes re-valideringsraden: teen tilhører banen og er ikke arkivert.
const teeResult = (
  overrides: Partial<{ course_id: string | null; archived_at: string | null }> = {},
) => ({
  data: { course_id: 'course-1', archived_at: null, ...overrides },
  error: null,
});

beforeEach(() => {
  vi.clearAllMocks();
  adminCupGroupId = null;
  adminMemberIds = [];
  adminCupCreatedBy = null;
  adminUserRows = DEFAULT_USER_ROWS;
  adminUserRowsError = null;
  adminExistingGameRows = [];
  adminExistingGamesError = null;
  adminExistingPlayerRows = [];
  adminExistingPlayersError = null;
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

describe('createCupMatchesFromPlan — plan lookup (#1472)', () => {
  it('no plan row: returns { error: missing_plan } without inserting', async () => {
    supabaseMock = buildSupabaseMock([
      { data: { is_admin: true }, error: null },
      { data: draftCup, error: null },
      { data: null, error: null }, // tournament_plans → ingen rad
    ]);
    setUser('admin-1');
    const { createCupMatchesFromPlan } = await import('./actions');
    expect(await createCupMatchesFromPlan(baseInput())).toEqual({
      error: 'missing_plan',
    });
    expect(
      supabaseMock.__fromCalls.some(
        (c) => c.table === 'games' && c.method === 'insert',
      ),
    ).toBe(false);
  });

  it('plan tee archived / on another course: returns { error: plan_tee }', async () => {
    supabaseMock = buildSupabaseMock([
      { data: { is_admin: true }, error: null },
      { data: draftCup, error: null },
      planResult(),
      teeResult({ archived_at: '2026-01-01T00:00:00Z' }), // teen er arkivert nå
    ]);
    setUser('admin-1');
    const { createCupMatchesFromPlan } = await import('./actions');
    expect(await createCupMatchesFromPlan(baseInput())).toEqual({
      error: 'plan_tee',
    });
    expect(
      supabaseMock.__fromCalls.some(
        (c) => c.table === 'games' && c.method === 'insert',
      ),
    ).toBe(false);
  });
});

/**
 * #1718: profil-lesingen svelget `error`. Et tomt kart ga stille 'mens'-tee og
 * hcpIndex 0 for ALLE spillere i batchen — feil tee-sett og feil greensome-
 * forslag, uten et eneste synlig tegn. Lesingen skal nå stoppe genereringen.
 */
describe('createCupMatchesFromPlan — profil-lesing (#1718)', () => {
  it('users-lesingen feiler: returnerer profile_read_failed uten å inserte noe', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    supabaseMock = buildSupabaseMock([
      { data: { is_admin: true }, error: null },
      { data: draftCup, error: null },
      planResult(),
      teeResult(),
    ]);
    adminUserRowsError = { message: 'profiles boom' };
    setUser('admin-1');

    const { createCupMatchesFromPlan } = await import('./actions');
    expect(await createCupMatchesFromPlan(baseInput())).toEqual({
      error: 'profile_read_failed',
    });

    expect(
      supabaseMock.__fromCalls.some(
        (c) =>
          (c.table === 'games' || c.table === 'game_players') &&
          c.method === 'insert',
      ),
      'ingenting skrevet — feilen kommer før første insert',
    ).toBe(false);
    expect(redirectMock).not.toHaveBeenCalled();
    expect(errSpy).toHaveBeenCalledWith(
      '[cup] generateMatches profile read failed',
      expect.objectContaining({ error: { message: 'profiles boom' } }),
    );
    errSpy.mockRestore();
  });
});

describe('createCupMatchesFromPlan — happy path', () => {
  function happyQueue() {
    return [
      { data: { is_admin: true }, error: null },
      { data: draftCup, error: null },
      planResult(),
      teeResult(),
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

  it('first match game row: scheduled status, format, label, mode_config + cup FK; bane/tee from plan', async () => {
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
    // #1472: bane/tee kommer fra planen, ikke fra input.
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
  it('club cup, all players members: games get group_id + redirects to klubb-route', async () => {
    adminCupGroupId = 'club-1';
    adminMemberIds = ['A1', 'A2', 'A3', 'B1', 'B2', 'B3'];
    supabaseMock = buildSupabaseMock([
      { data: { is_admin: true }, error: null },
      { data: { ...draftCup, group_id: 'club-1' }, error: null },
      planResult(),
      teeResult(),
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
      planResult(),
      teeResult(),
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
  it('game_players insert fails on match 2: deletes ALL accumulated games, returns insert_failed', async () => {
    supabaseMock = buildSupabaseMock([
      { data: { is_admin: true }, error: null }, // requireAdmin
      { data: draftCup, error: null }, // tournament gate
      planResult(), // plan lookup
      teeResult(), // tee re-validate
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
      planResult(), // plan (best_ball null → best_ball allowance faller til fourball 85)
      teeResult(), // tee re-validate
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
    // #1539/#1551: best_ball bærer allowancen på games-raden, ikke i
    // mode_config — den anvendes én gang når course_handicap fryses, så
    // kampens tavle og cup-poenget leser samme tall.
    expect(bestBallRow.mode_config).toEqual({
      kind: 'best_ball',
      team_size: 2,
      teams_count: 2,
    });
    expect(bestBallRow.hcp_allowance_pct).toBe(85); // draftCups fourball_allowance_pct (D4/D11 ASSUMPTION)
    // Matchplay-familien beholder sitt hjem i mode_config og står på 100 der.
    expect(greensomeRow.hcp_allowance_pct).toBe(100);

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
      planResult(),
      teeResult(),
      { data: { id: 'game-greensome' }, error: null },
      { data: null, error: null },
    ]);
    setUser('admin-1');
    const { createCupMatchesFromPlan } = await import('./actions');

    await expect(
      createCupMatchesFromPlan({
        tournamentId: 'cup-1',
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
      // #1628: auto-sporet skrives ved siden av. Teen i denne fiksturen har
      // ingen rating-kolonner → samme fallback som veiviseren (rå HCP-indeks):
      // 60/40 av 5/10 = 7, av 6/11 = 8.
      team_strokes_override_auto: { team1: 7, team2: 8 },
    });
  });

  // #1628: sporet MÅ være det samme tallet veiviseren pre-fylte feltet med —
  // ellers leser runde-starten «arrangøren har rørt feltet» på en urørt verdi
  // (eller motsatt) og re-deriveringen bommer.
  it('team_strokes_override_auto: regnet på spillehandicapet på planens tee, i paritet med veiviserens forslag', async () => {
    const match: CupBatchMatch = {
      id: 'greensome_matchplay-1',
      format: 'greensome_matchplay',
      label: 'Greensome 1',
      side1: ['p1', 'p2'],
      side2: ['p3', 'p4'],
      segment: 'front9',
      flightIndex: 1,
      // Arrangørens eget tall på side 1; side 2 står på forslaget.
      teamStrokesOverride: { team1: 3, team2: 12 },
    };
    // Slope 132 / CR 71.5 / par 72 gjør spillehandicapet ≠ HCP-indeksen, så
    // testen faktisk beviser at rating-settet brukes:
    //   p1: round(20 * 132/113 + (71.5 - 72)) = round(22.86) = 23
    //   p2: round(10 * 132/113 - 0.5)         = round(11.18) = 11
    //   60/40 → round(0.6*11 + 0.4*23) = round(15.8) = 16
    //   p3: round(4 * 132/113 - 0.5) = round(4.17) = 4
    //   p4: round(30 * 132/113 - 0.5) = round(34.54) = 35
    //   60/40 → round(0.6*4 + 0.4*35) = round(16.4) = 16
    adminUserRows = [
      { id: 'p1', gender: 'mens', hcp_index: 20 },
      { id: 'p2', gender: 'mens', hcp_index: 10 },
      { id: 'p3', gender: 'mens', hcp_index: 4 },
      { id: 'p4', gender: 'mens', hcp_index: 30 },
    ];
    supabaseMock = buildSupabaseMock([
      { data: { is_admin: true }, error: null },
      { data: draftCup, error: null },
      planResult(),
      {
        data: {
          course_id: 'course-1',
          archived_at: null,
          slope_mens: 132,
          course_rating_mens: 71.5,
          par_total_mens: 72,
        },
        error: null,
      },
      { data: { id: 'game-greensome' }, error: null },
      { data: null, error: null },
    ]);
    setUser('admin-1');
    const { createCupMatchesFromPlan } = await import('./actions');

    await expect(
      createCupMatchesFromPlan({ tournamentId: 'cup-1', matches: [match] }),
    ).rejects.toBeInstanceOf(RedirectError);

    const row = supabaseMock.__fromCalls.find(
      (c) => c.table === 'games' && c.method === 'insert',
    )!.args[0] as Record<string, unknown>;
    const config = row.mode_config as Record<string, unknown>;
    expect(config.team_strokes_override).toEqual({ team1: 3, team2: 12 });
    expect(config.team_strokes_override_auto).toEqual({ team1: 16, team2: 16 });
  });

  it('ikke-greensome format: intet auto-spor', async () => {
    const match: CupBatchMatch = {
      id: 'best_ball-1',
      format: 'best_ball',
      label: 'Best ball 1',
      side1: ['p1', 'p2'],
      side2: ['p3', 'p4'],
      segment: 'back9',
      flightIndex: 1,
      teamStrokesOverride: { team1: 5, team2: 0 },
    };
    supabaseMock = buildSupabaseMock([
      { data: { is_admin: true }, error: null },
      { data: draftCup, error: null },
      planResult(),
      teeResult(),
      { data: { id: 'game-bestball' }, error: null },
      { data: null, error: null },
    ]);
    setUser('admin-1');
    const { createCupMatchesFromPlan } = await import('./actions');

    await expect(
      createCupMatchesFromPlan({ tournamentId: 'cup-1', matches: [match] }),
    ).rejects.toBeInstanceOf(RedirectError);

    const row = supabaseMock.__fromCalls.find(
      (c) => c.table === 'games' && c.method === 'insert',
    )!.args[0] as Record<string, unknown>;
    expect(row.mode_config).toEqual({
      kind: 'best_ball',
      team_size: 2,
      teams_count: 2,
    });
  });

  it('planens best_ball_allowance_pct overstyrer best_ball hcp_allowance_pct i stedet for cupens fourball-default (#1441 F3c → #1472)', async () => {
    const match: CupBatchMatch = {
      id: 'best_ball-1',
      format: 'best_ball',
      label: 'Best ball 1',
      side1: ['p1', 'p2'],
      side2: ['p3', 'p4'],
      segment: 'back9',
      flightIndex: 1,
    };
    supabaseMock = buildSupabaseMock([
      { data: { is_admin: true }, error: null },
      { data: draftCup, error: null }, // fourball_allowance_pct: 85 — skal IKKE brukes her
      planResult({ best_ball_allowance_pct: 70 }), // planen har egen best-ball-andel
      teeResult(),
      { data: { id: 'game-bestball' }, error: null },
      { data: null, error: null },
    ]);
    setUser('admin-1');
    const { createCupMatchesFromPlan } = await import('./actions');

    await expect(
      createCupMatchesFromPlan({
        tournamentId: 'cup-1',
        matches: [match],
      }),
    ).rejects.toBeInstanceOf(RedirectError);

    const row = supabaseMock.__fromCalls.find(
      (c) => c.table === 'games' && c.method === 'insert',
    )!.args[0] as Record<string, unknown>;
    // #1539/#1551: verdien lander på games-raden, ikke i mode_config.
    expect(row.mode_config).toEqual({
      kind: 'best_ball',
      team_size: 2,
      teams_count: 2,
    });
    expect(row.hcp_allowance_pct).toBe(70);
  });
});

describe('createCupMatchesFromPlan — ordinære preset-matcher beholder dagens kolonner (#1441 regresjon)', () => {
  it('hole_segment eksplisitt "full"; score_visibility UTELATES (arver DB-default \'live\')', async () => {
    supabaseMock = buildSupabaseMock([
      { data: { is_admin: true }, error: null },
      { data: draftCup, error: null },
      planResult(),
      teeResult(),
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
        matches: [match],
      }),
    ).toEqual({ error: 'invalid_team_strokes_override' });
  });
});

describe('createCupMatchesFromPlan — scheduled_tee_off_at / cup-start (#1441 owner-QA, F3d → #1472)', () => {
  it('planen har tee-off: kolonnen settes på BÅDE host- og avledet-pass, samme flight deler tidspunkt', async () => {
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

    supabaseMock = buildSupabaseMock([
      { data: { is_admin: true }, error: null }, // requireAdmin
      { data: draftCup, error: null }, // tournament gate
      planResult({ scheduled_tee_off_at: '2099-06-01T07:00:00.000Z' }), // planens tee-off
      teeResult(),
      { data: { id: 'game-greensome' }, error: null }, // pass 1: greensome host
      { data: null, error: null },
      { data: { id: 'game-bestball' }, error: null }, // pass 1: best_ball host
      { data: null, error: null },
      { data: { id: 'game-singles1' }, error: null }, // pass 2: derived singles 1
      { data: null, error: null },
      { data: { id: 'game-singles2' }, error: null }, // pass 2: derived singles 2
      { data: null, error: null },
    ]);
    setUser('admin-1');
    const { createCupMatchesFromPlan } = await import('./actions');

    await expect(
      createCupMatchesFromPlan({
        tournamentId: 'cup-1',
        matches: bundle,
      }),
    ).rejects.toBeInstanceOf(RedirectError);

    const rows = supabaseMock.__fromCalls
      .filter((c) => c.table === 'games' && c.method === 'insert')
      .map((c) => c.args[0] as Record<string, unknown>);
    expect(rows).toHaveLength(4); // greensome host + best_ball host + 2 derived singles
    // Alle fire matchene sitter i flight 1 — cup-starten selv, INGEN
    // forsinkelse. Selve forskyvnings-matematikken for flight ≥2 er dekket
    // av lib/cup/splitDayLineup.test.ts (`resolveScheduledTeeOffAt`) — dette
    // beviset er ren WIRING: begge insert-pass setter kolonnen.
    for (const row of rows) {
      expect(row.scheduled_tee_off_at).toBe('2099-06-01T07:00:00.000Z');
    }
  });

  it('planen har ingen tee-off: kolonnen er null på alle innsatte matcher (dagens oppførsel)', async () => {
    supabaseMock = buildSupabaseMock([
      { data: { is_admin: true }, error: null },
      { data: draftCup, error: null },
      planResult(), // scheduled_tee_off_at null
      teeResult(),
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

    const rows = supabaseMock.__fromCalls
      .filter((c) => c.table === 'games' && c.method === 'insert')
      .map((c) => c.args[0] as Record<string, unknown>);
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.scheduled_tee_off_at).toBeNull();
    }
  });

  it('planens tee-off er i fortiden: tee_off_in_past, ingen matcher opprettet (tilbake til Oppsett)', async () => {
    supabaseMock = buildSupabaseMock([
      { data: { is_admin: true }, error: null },
      { data: draftCup, error: null },
      planResult({ scheduled_tee_off_at: '2020-01-01T10:00:00.000Z' }), // stale tee-off
      teeResult(),
    ]);
    setUser('admin-1');
    const { createCupMatchesFromPlan } = await import('./actions');

    expect(await createCupMatchesFromPlan(baseInput())).toEqual({
      error: 'tee_off_in_past',
    });
    expect(
      supabaseMock.__fromCalls.some(
        (c) => c.table === 'games' && c.method === 'insert',
      ),
    ).toBe(false);
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
    supabaseMock = buildSupabaseMock([
      { data: { is_admin: true }, error: null }, // requireAdmin
      { data: draftCup, error: null }, // tournament gate
      planResult(), // plan lookup
      teeResult(), // tee re-validate
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
      planResult(), // plan lookup
      teeResult(), // tee re-validate
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
        matches,
      }),
    ).toEqual({ error: 'too_many_matches' });
    expect(
      supabaseMock.__fromCalls.some((c) => c.table === 'games' && c.method === 'insert'),
    ).toBe(false);
  });
});

// #1810: begge tellingene i cap-grenen ignorerte error-kanalen. En feilet
// `games`-lesing undertelte match-taket OG hoppet over deltaker-lesingen helt
// (`if (existingGameIds.length > 0)`), så begge takene slapp batchen gjennom.
// Vakta skal feile LUKKET: ingenting er skrevet, så `insert_failed` er riktig
// svar til veiviseren.
describe('createCupMatchesFromPlan — cap-vakta feiler lukket ved lesefeil (#1810)', () => {
  function capSetup() {
    adminCupCreatedBy = 'user-1'; // ikke-admin passerer som cupens egen skaper
    supabaseMock = buildSupabaseMock([
      { data: { is_admin: false }, error: null }, // requireAdmin (loadRole)
      { data: draftCup, error: null }, // tournament gate (frittstående cup)
      planResult(), // plan lookup
      teeResult(), // tee re-validate
    ]);
    setUser('user-1');
  }

  it('games-lesingen feiler: insert_failed, ingen insert', async () => {
    capSetup();
    adminExistingGamesError = { message: 'boom' };

    const { createCupMatchesFromPlan } = await import('./actions');
    expect(await createCupMatchesFromPlan(baseInput())).toEqual({
      error: 'insert_failed',
    });
    expect(
      supabaseMock.__fromCalls.some((c) => c.table === 'games' && c.method === 'insert'),
    ).toBe(false);
  });

  it('game_players-lesingen feiler: insert_failed, ingen insert', async () => {
    capSetup();
    // Deltaker-lesingen kjøres bare når det finnes minst ett eksisterende spill.
    adminExistingGameRows = [{ id: 'game-old' }];
    adminExistingPlayersError = { message: 'boom' };

    const { createCupMatchesFromPlan } = await import('./actions');
    expect(await createCupMatchesFromPlan(baseInput())).toEqual({
      error: 'insert_failed',
    });
    expect(
      supabaseMock.__fromCalls.some((c) => c.table === 'games' && c.method === 'insert'),
    ).toBe(false);
  });
});
