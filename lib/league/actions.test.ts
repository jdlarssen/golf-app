import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildSupabaseMock, makeRedirectMock, RedirectError } from '@/tests/serverActionMocks';

/**
 * Regression test for #647 Bug 1 + Bug 2: startLeagueRoundFlight could never
 * create a flight in prod. The game_players insert sent `status: 'active'` —
 * a column the table does not have (Bug 1) — and `team_number: 1` without a
 * `flight_number`, violating game_players_team_flight_consistency (Bug 2).
 * Either alone rejects the insert, so no league round could ever be played.
 *
 * The corrected payload: no `status`, `team_number: null` (league is solo), and
 * accepted_at via acceptedAtForActor (the #463 confirmation semantics — only
 * the player who starts the flight is confirmed, co-players stay pending).
 */

const redirectMock = makeRedirectMock();
vi.mock('next/navigation', () => ({
  redirect: (url: string) => redirectMock(url),
}));
vi.mock('@/lib/i18n/revalidateLocalePath', () => ({
  revalidatePath: vi.fn(),
}));
// Flip-to-active succeeds → the action redirects right after the insert we
// want to inspect, so the flow stops cleanly without driving more queries.
vi.mock('@/lib/games/startScheduledGame', () => ({
  startScheduledGame: async () => ({ ok: true }),
}));

let supabaseMock: ReturnType<typeof buildSupabaseMock>;
vi.mock('@/lib/supabase/server', () => ({
  getServerClient: async () => supabaseMock,
}));
// requireAdminOrClubAdminOfLeague reads the league's group_id via the admin
// client before delegating to the role gate; the #727 test below drives that path.
let adminMock: ReturnType<typeof buildSupabaseMock>;
vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => adminMock,
}));

function setUser(id: string) {
  (supabaseMock.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
    data: { user: { id, email: `${id}@x.no` } },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('startLeagueRoundFlight — game_players insert (#647)', () => {
  it('inserts with no status column and team_number null', async () => {
    supabaseMock = buildSupabaseMock([
      // 1. league_rounds.maybeSingle — wide window so the gate always passes
      {
        data: {
          id: 'r1',
          league_id: 'l1',
          course_id: 'c1',
          tee_box_id: 'tb1',
          opens_at: '2000-01-01T00:00:00Z',
          closes_at: '2099-01-01T00:00:00Z',
          original_closes_at: '2099-01-01T00:00:00Z',
        },
      },
      // 2. leagues.maybeSingle
      { data: { id: 'l1', name: 'Test-liga', course_id: 'c1', tee_box_id: 'tb1', status: 'active', format: 'stroke' } },
      // 3. league_players (membership)
      { data: [{ user_id: 'u1' }, { user_id: 'u2' }] },
      // 4. games (prior finished flights → none)
      { data: [] },
      // 5. users (tee_gender roster)
      { data: [{ id: 'u1', gender: 'male' }, { id: 'u2', gender: 'female' }] },
      // 6. games.insert(...).select('id').single
      { data: { id: 'g1' }, error: null },
      // 7. game_players.insert (the payload under test)
      { error: null },
    ]);
    setUser('u1');

    const { startLeagueRoundFlight } = await import('./actions');
    await expect(startLeagueRoundFlight('r1', ['u2'])).rejects.toBeInstanceOf(RedirectError);

    const gpInsert = supabaseMock.__fromCalls.find(
      (c) => c.table === 'game_players' && c.method === 'insert',
    );
    expect(gpInsert, 'game_players insert was issued').toBeDefined();
    const rows = gpInsert!.args[0] as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(2);
    // The non-existent `status` column must never be sent again (Bug 1).
    expect(rows.every((r) => !('status' in r))).toBe(true);
    // Solo → team_number null satisfies team_flight_consistency (Bug 2).
    expect(rows.every((r) => r.team_number === null)).toBe(true);
    // #463: actor confirmed now, co-player pending (acceptedAtForActor).
    const actor = rows.find((r) => r.user_id === 'u1')!;
    const coPlayer = rows.find((r) => r.user_id === 'u2')!;
    expect(typeof actor.accepted_at).toBe('string');
    expect(coPlayer.accepted_at).toBeNull();
  });
});

/**
 * #675: createLeagueDraft inserted leagues, then league_rounds, then
 * league_players in separate non-transactional steps. A failure after the
 * leagues insert left an orphan draft league in /admin/liga that the
 * non-technical owner could not clean up. The fix rolls the leagues row back
 * (FK on delete cascade clears rounds + players), mirroring
 * startLeagueRoundFlight's rollback.
 */
describe('createLeagueDraft — rollback on insert failure (#675)', () => {
  function leagueForm(): FormData {
    const fd = new FormData();
    fd.set('name', 'Test-liga');
    fd.set('season_start', '2026-01-01');
    fd.set('season_end', '2026-12-31');
    fd.set('format', 'stroke');
    fd.set('scoring', 'net');
    fd.set('standings_model', 'total');
    fd.set('missed_round_policy', 'penalty');
    fd.set('penalty_kind', 'worst_plus_one');
    fd.set('course_scope', 'multi_course'); // no course/tee fields needed
    fd.set('frequency', 'monthly'); // a full season → >0 round windows
    return fd;
  }

  it('deletes the committed leagues row when league_rounds insert fails', async () => {
    supabaseMock = buildSupabaseMock([
      { data: { is_admin: true }, error: null }, // requireAdmin (loadRole)
      { data: { id: 'L1' }, error: null }, // leagues.insert().select('id').single
      { error: { message: 'boom' } }, // league_rounds.insert FAILS
      { error: null }, // rollback: leagues.delete().eq('id', 'L1')
    ]);
    setUser('admin-1');
    const { createLeagueDraft } = await import('./actions');

    expect(await createLeagueDraft(leagueForm())).toEqual({
      error: 'rounds_failed',
    });

    const del = supabaseMock.__fromCalls.find(
      (c) => c.table === 'leagues' && c.method === 'delete',
    );
    expect(del, 'leagues.delete issued for rollback').toBeDefined();
    const eqCall = supabaseMock.__fromCalls.find(
      (c) => c.table === 'leagues' && c.method === 'eq',
    );
    expect(eqCall!.args).toEqual(['id', 'L1']);
  });
});

/**
 * #727: the cup/liga UPDATE-by-id paths now route their write through
 * expectAffected, so a silent 0-row no-op (id vanished after the pre-flight
 * fetch) surfaces as the action's error code instead of a false success. One
 * representative path locks the throw→error-code + .select() wiring; the helper
 * itself is unit-tested in lib/supabase/affectedRows.test.ts.
 */
describe('updateLeagueRound — 0-row update is a failure (#727)', () => {
  it('returns update_failed when the round update matches no row', async () => {
    // group_id null → requireAdminOrClubAdminOfLeague delegates to requireAdmin.
    adminMock = buildSupabaseMock([{ data: { group_id: null } }]);
    supabaseMock = buildSupabaseMock([
      { data: { is_admin: true }, error: null }, // loadRole users.single
      { data: [] }, // league_rounds.update(...).eq('id').select('id') → 0 rows
    ]);
    setUser('admin-1');

    const fd = new FormData();
    fd.set('round_id', 'r1');
    fd.set('league_id', 'l1');
    fd.set('label', 'Runde 1'); // non-empty patch so the update is issued

    const { updateLeagueRound } = await import('./actions');
    expect(await updateLeagueRound(fd)).toEqual({ error: 'update_failed' });

    const upd = supabaseMock.__fromCalls.find(
      (c) => c.table === 'league_rounds' && c.method === 'update',
    );
    expect(upd, 'league_rounds update issued').toBeDefined();
    // The retrofit must chain .select() so PostgREST returns the affected rows.
    const sel = supabaseMock.__fromCalls.find(
      (c) => c.table === 'league_rounds' && c.method === 'select',
    );
    expect(sel, 'update chained .select() for row-count assertion').toBeDefined();
  });
});

/**
 * #737 chaos-injection: the league-draft and league-flight rollbacks (#675/#647)
 * each lacked a test for one branch. These cover the remaining mid-sequence
 * failures so every multi-step league creation path proves it leaves no orphan.
 */
describe('createLeagueDraft — rollback on league_players failure (#737)', () => {
  function leagueFormWithPlayers(): FormData {
    const fd = new FormData();
    fd.set('name', 'Test-liga');
    fd.set('season_start', '2026-01-01');
    fd.set('season_end', '2026-12-31');
    fd.set('format', 'stroke');
    fd.set('scoring', 'net');
    fd.set('standings_model', 'total');
    fd.set('missed_round_policy', 'penalty');
    fd.set('penalty_kind', 'worst_plus_one');
    fd.set('course_scope', 'multi_course');
    fd.set('frequency', 'monthly');
    fd.set('player_ids', JSON.stringify(['p1', 'p2'])); // standalone → no member filter
    return fd;
  }

  it('deletes the committed leagues row when league_players insert fails', async () => {
    supabaseMock = buildSupabaseMock([
      { data: { is_admin: true }, error: null }, // requireAdmin
      { data: { id: 'L2' }, error: null }, // leagues.insert().select('id').single
      { error: null }, // league_rounds.insert OK
      { error: { message: 'boom' } }, // league_players.insert FAILS
      { error: null }, // rollback: leagues.delete().eq('id','L2')
    ]);
    setUser('admin-1');
    const { createLeagueDraft } = await import('./actions');

    expect(await createLeagueDraft(leagueFormWithPlayers())).toEqual({
      error: 'players_failed',
    });

    const del = supabaseMock.__fromCalls.find(
      (c) => c.table === 'leagues' && c.method === 'delete',
    );
    expect(del, 'leagues.delete issued for rollback').toBeDefined();
    const eqCall = supabaseMock.__fromCalls.find(
      (c) => c.table === 'leagues' && c.method === 'eq',
    );
    expect(eqCall!.args).toEqual(['id', 'L2']);
  });
});

/**
 * #924: past-window guard, the liga symmetry of #902. A liga round is playable
 * in [opens_at, closes_at]; a round whose window has already closed is
 * unplayable (startLeagueRoundFlight → outside_window), almost always a mistyped
 * year. addLeagueRound blocks adding such a round; createLeagueDraft blocks
 * creating a league whose entire season is already over. Both reuse the #902
 * isTeeOffInPast helper (5-min grace). Edit/reopen paths stay unguarded.
 *
 * Literal far-past (2020) / far-future (2099) instants keep these drift-proof.
 */
describe('addLeagueRound — past close window is blocked (#924)', () => {
  function roundForm(opensAt: string, closesAt: string): FormData {
    const fd = new FormData();
    fd.set('league_id', 'l1');
    fd.set('opens_at', opensAt);
    fd.set('closes_at', closesAt);
    return fd;
  }

  it('rejects a round whose close window is already in the past, no insert', async () => {
    // group_id null → requireAdminOrClubAdminOfLeague delegates to requireAdmin.
    adminMock = buildSupabaseMock([{ data: { group_id: null } }]);
    supabaseMock = buildSupabaseMock([
      { data: { is_admin: true }, error: null }, // loadRole users.single
    ]);
    setUser('admin-1');

    const { addLeagueRound } = await import('./actions');
    // Both bounds in 2020: window order is valid (closes > opens) so the guard,
    // not the 'window' check, is what rejects it.
    expect(
      await addLeagueRound(roundForm('2020-05-01T08:00', '2020-05-01T18:00')),
    ).toEqual({ error: 'round_in_past' });

    const ins = supabaseMock.__fromCalls.find(
      (c) => c.table === 'league_rounds' && c.method === 'insert',
    );
    expect(ins, 'no league_rounds insert for a past round').toBeUndefined();
  });

  it('accepts a future round and proceeds to the insert', async () => {
    adminMock = buildSupabaseMock([{ data: { group_id: null } }]);
    supabaseMock = buildSupabaseMock([
      { data: { is_admin: true }, error: null }, // loadRole
      { data: { course_scope: 'multi_course', course_id: null, tee_box_id: null } }, // leagues.maybeSingle
      { data: { sequence: 2 } }, // last round sequence
      { data: [{ id: 'r9' }], error: null }, // league_rounds.insert().select('id')
    ]);
    setUser('admin-1');

    const { addLeagueRound } = await import('./actions');
    expect(
      await addLeagueRound(roundForm('2099-05-01T08:00', '2099-05-01T18:00')),
    ).toEqual({ error: '' });

    const ins = supabaseMock.__fromCalls.find(
      (c) => c.table === 'league_rounds' && c.method === 'insert',
    );
    expect(ins, 'future round reaches the insert').toBeDefined();
  });
});

describe('createLeagueDraft — fully-past season is blocked (#924)', () => {
  function seasonForm(start: string, end: string): FormData {
    const fd = new FormData();
    fd.set('name', 'Test-liga');
    fd.set('season_start', start);
    fd.set('season_end', end);
    fd.set('format', 'stroke');
    fd.set('scoring', 'net');
    fd.set('standings_model', 'total');
    fd.set('missed_round_policy', 'penalty');
    fd.set('penalty_kind', 'worst_plus_one');
    fd.set('course_scope', 'multi_course');
    fd.set('frequency', 'monthly');
    return fd;
  }

  it('rejects a season already entirely over, no leagues insert', async () => {
    supabaseMock = buildSupabaseMock([
      { data: { is_admin: true }, error: null }, // requireAdmin
    ]);
    setUser('admin-1');

    const { createLeagueDraft } = await import('./actions');
    // Whole 2020 season is over → last generated window closed long ago.
    expect(await createLeagueDraft(seasonForm('2020-01-01', '2020-12-31'))).toEqual({
      error: 'season_over',
    });

    const ins = supabaseMock.__fromCalls.find(
      (c) => c.table === 'leagues' && c.method === 'insert',
    );
    expect(ins, 'no leagues insert for a fully-past season').toBeUndefined();
    // The accepted (future-season) path is already locked by the #675/#737
    // tests above, which use a 2026 season and reach the leagues insert.
  });
});

describe('startLeagueRoundFlight — rollback on game_players failure (#737)', () => {
  it('deletes the committed games row when the flight game_players insert fails', async () => {
    supabaseMock = buildSupabaseMock([
      // 1. round (wide window so the gate passes)
      {
        data: {
          id: 'r1',
          league_id: 'l1',
          course_id: 'c1',
          tee_box_id: 'tb1',
          opens_at: '2000-01-01T00:00:00Z',
          closes_at: '2099-01-01T00:00:00Z',
          original_closes_at: '2099-01-01T00:00:00Z',
        },
      },
      // 2. league (active)
      { data: { id: 'l1', name: 'Test-liga', course_id: 'c1', tee_box_id: 'tb1', status: 'active', format: 'stroke' } },
      // 3. membership
      { data: [{ user_id: 'u1' }, { user_id: 'u2' }] },
      // 4. prior finished flights → none
      { data: [] },
      // 5. tee_gender roster
      { data: [{ id: 'u1', gender: 'male' }, { id: 'u2', gender: 'female' }] },
      // 6. games.insert(...).select('id').single
      { data: { id: 'g1' }, error: null },
      // 7. game_players.insert FAILS
      { error: { message: 'boom' } },
      // 8. rollback: games.delete().eq('id','g1')
      { error: null },
    ]);
    setUser('u1');
    const { startLeagueRoundFlight } = await import('./actions');

    expect(await startLeagueRoundFlight('r1', ['u2'])).toEqual({
      error: 'insert_failed',
    });

    // The committed flight game is rolled back (game_players cascade), so no
    // orphan game is left for the round.
    const calls = supabaseMock.__fromCalls;
    const delIdx = calls.findIndex(
      (c) => c.table === 'games' && c.method === 'delete',
    );
    expect(delIdx, 'games.delete issued for rollback').toBeGreaterThanOrEqual(0);
    // The `eq` that targets the rollback delete is the first games-eq after it
    // (earlier games-eq calls belong to the prior-finished-flights query).
    const eqAfter = calls
      .slice(delIdx)
      .find((c) => c.table === 'games' && c.method === 'eq');
    expect(eqAfter!.args).toEqual(['id', 'g1']);
  });
});
