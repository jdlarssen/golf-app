import { test, expect } from '@playwright/test';
import {
  envReady,
  skipReason,
  adminClient,
  ADMIN_EMAIL,
  PLAYER_EMAIL,
  signInViaOtp,
} from '../_helpers/games';

/**
 * Liga golden-path E2E (#453, Fase 1).
 *
 * Follows the env-guarded prod-DB pattern (see e2e/_helpers/games.ts): skips
 * without service-role + seeded admin/player emails so `npm run e2e` never
 * fails just because a dev lacks secrets. All seeded rows use a `TEST-Liga-`
 * prefix and are torn down in afterAll.
 *
 * Scope: the create surface + the public read path (snapshot → standings table
 * render). The full flight→scoring→standings numeric path is covered by the
 * Type A unit tests (computeLeagueStandings, generateRounds) and manual smoke —
 * we deliberately don't drive an 18-hole multi-player scorecard through the UI
 * here (brittle, and the maths is already exhaustively unit-tested).
 */

test.describe('Liga', () => {
  test.skip(!envReady, skipReason);

  let leagueId: string | null = null;

  test.afterAll(async () => {
    if (!leagueId) return;
    const admin = adminClient();
    // league delete cascades league_rounds + league_players.
    await admin.from('leagues').delete().eq('id', leagueId);
  });

  test('admin can open the create wizard', async ({ page }) => {
    await page.goto('/login?next=/admin/liga/new');
    await signInViaOtp(page, ADMIN_EMAIL!);
    await page.goto('/admin/liga/new');
    await expect(page.getByTestId('liga-create-form')).toBeVisible();
  });

  test('public league page renders the season table and rounds', async ({ page }) => {
    const admin = adminClient();

    // Resolve admin + player + a usable course/tee.
    const { data: adminUser } = await admin
      .from('users')
      .select('id')
      .ilike('email', ADMIN_EMAIL!)
      .maybeSingle<{ id: string }>();
    const { data: playerUser } = await admin
      .from('users')
      .select('id')
      .ilike('email', PLAYER_EMAIL!)
      .maybeSingle<{ id: string }>();
    expect(adminUser, 'admin user must be seeded').toBeTruthy();
    expect(playerUser, 'player user must be seeded').toBeTruthy();

    const { data: tee } = await admin
      .from('tee_boxes')
      .select('id, course_id')
      .not('par_total_mens', 'is', null)
      .limit(1)
      .maybeSingle<{ id: string; course_id: string }>();
    expect(tee, 'a tee with a mens rating must exist').toBeTruthy();

    // Seed an active league with one open round + both participants.
    const now = Date.now();
    const day = 86_400_000;
    const { data: league, error: lErr } = await admin
      .from('leagues')
      .insert({
        name: `TEST-Liga-${now}`,
        season_start: new Date(now - day).toISOString().slice(0, 10),
        season_end: new Date(now + 30 * day).toISOString().slice(0, 10),
        format: 'stroke',
        scoring: 'net',
        standings_model: 'total',
        course_scope: 'single_course_single_tee',
        course_id: tee!.course_id,
        tee_box_id: tee!.id,
        status: 'active',
        created_by: adminUser!.id,
      })
      .select('id')
      .single<{ id: string }>();
    expect(lErr).toBeNull();
    leagueId = league!.id;

    await admin.from('league_rounds').insert({
      league_id: leagueId,
      sequence: 1,
      label: 'Runde 1',
      course_id: tee!.course_id,
      tee_box_id: tee!.id,
      opens_at: new Date(now - day).toISOString(),
      closes_at: new Date(now + 7 * day).toISOString(),
      original_closes_at: new Date(now + 7 * day).toISOString(),
    });
    await admin.from('league_players').insert([
      { league_id: leagueId, user_id: adminUser!.id },
      { league_id: leagueId, user_id: playerUser!.id },
    ]);

    // Visit the public page as the admin (a participant).
    await page.goto('/login?next=/');
    await signInViaOtp(page, ADMIN_EMAIL!);
    await page.goto(`/liga/${leagueId}`);

    // Season table renders (empty state, since no flight delivered yet) and the
    // seeded round is listed.
    await expect(page.getByTestId('liga-standings-empty')).toBeVisible();
    await expect(page.getByTestId('liga-round')).toHaveCount(1);
  });
});

/**
 * #674 (del 1, #647-reproduser): den forrige liga-testen seeder rundene/
 * spillerne DIREKTE og asserter bare tom-tilstanden — den kjører aldri
 * standings-fra-ferdig-flight-stien der #647 levde (flight-insert-constraint +
 * course_holes.par-krasj). Denne seeder en FERDIG flight (samme shape som
 * `startLeagueRoundFlight`: `solo_strokeplay`, `league_round_id`) + scores, og
 * asserter at den offentlige standings-tabellen rendrer TALL — ikke tom-
 * tilstanden og ikke #680-error-fallbacken som en par-500 ville utløst.
 */
test.describe('Liga — finished-flight standings (#647 read-path)', () => {
  test.skip(!envReady, skipReason);
  test.slow();

  let leagueId: string | null = null;
  let flightGameId: string | null = null;

  test.afterAll(async () => {
    const admin = adminClient();
    if (flightGameId) await admin.from('games').delete().eq('id', flightGameId);
    if (leagueId) await admin.from('leagues').delete().eq('id', leagueId);
  });

  test('a delivered finished flight makes the standings table render numbers', async ({
    page,
  }) => {
    const admin = adminClient();

    const { data: adminUser } = await admin
      .from('users')
      .select('id')
      .ilike('email', ADMIN_EMAIL!)
      .maybeSingle<{ id: string }>();
    const { data: playerUser } = await admin
      .from('users')
      .select('id')
      .ilike('email', PLAYER_EMAIL!)
      .maybeSingle<{ id: string }>();
    expect(adminUser, 'admin user seeded').toBeTruthy();
    expect(playerUser, 'player user seeded').toBeTruthy();

    const { data: tee } = await admin
      .from('tee_boxes')
      .select('id, course_id')
      .not('par_total_mens', 'is', null)
      .limit(1)
      .maybeSingle<{ id: string; course_id: string }>();
    expect(tee, 'a tee with a mens rating').toBeTruthy();

    const now = Date.now();
    const day = 86_400_000;
    const { data: league, error: lErr } = await admin
      .from('leagues')
      .insert({
        name: `TEST-Liga-finished-${now}`,
        season_start: new Date(now - day).toISOString().slice(0, 10),
        season_end: new Date(now + 30 * day).toISOString().slice(0, 10),
        format: 'stroke',
        scoring: 'net',
        standings_model: 'total',
        course_scope: 'single_course_single_tee',
        course_id: tee!.course_id,
        tee_box_id: tee!.id,
        status: 'active',
        created_by: adminUser!.id,
      })
      .select('id')
      .single<{ id: string }>();
    expect(lErr).toBeNull();
    leagueId = league!.id;

    const { data: round, error: rErr } = await admin
      .from('league_rounds')
      .insert({
        league_id: leagueId,
        sequence: 1,
        label: 'Runde 1',
        course_id: tee!.course_id,
        tee_box_id: tee!.id,
        opens_at: new Date(now - day).toISOString(),
        closes_at: new Date(now + 7 * day).toISOString(),
        original_closes_at: new Date(now + 7 * day).toISOString(),
      })
      .select('id')
      .single<{ id: string }>();
    expect(rErr).toBeNull();
    const roundId = round!.id;

    const stampIso = new Date().toISOString();
    await admin.from('league_players').insert([
      { league_id: leagueId, user_id: adminUser!.id, accepted_at: stampIso },
      { league_id: leagueId, user_id: playerUser!.id, accepted_at: stampIso },
    ]);

    // Finished flight tied to the round — mirrors startLeagueRoundFlight's shape
    // (solo_strokeplay, league_round_id), delivered + approved.
    const { data: flight, error: fErr } = await admin
      .from('games')
      .insert({
        name: `TEST-Liga-finished-${now} – Runde`,
        course_id: tee!.course_id,
        tee_box_id: tee!.id,
        status: 'finished',
        game_mode: 'solo_strokeplay',
        mode_config: { kind: 'solo_strokeplay', team_size: 1 },
        created_by: adminUser!.id,
        league_round_id: roundId,
      })
      .select('id')
      .single<{ id: string }>();
    expect(fErr).toBeNull();
    flightGameId = flight!.id;

    await admin.from('game_players').insert([
      {
        game_id: flightGameId,
        user_id: adminUser!.id,
        team_number: null,
        flight_number: 1,
        course_handicap: 12,
        accepted_at: stampIso,
        submitted_at: stampIso,
        approved_at: stampIso,
      },
      {
        game_id: flightGameId,
        user_id: playerUser!.id,
        team_number: null,
        flight_number: 1,
        course_handicap: 18,
        accepted_at: stampIso,
        submitted_at: stampIso,
        approved_at: stampIso,
      },
    ]);

    // Seed en score per HULL på banen (ikke bare et utvalg): standings filtrerer
    // bort runder der `holesPlayed !== holeCount` (roundScoring), så en delvis
    // runde ville gitt tomme celler. Full runde ⇒ tellende ⇒ tall i tabellen.
    const { data: courseHoles } = await admin
      .from('course_holes')
      .select('hole_number')
      .eq('course_id', tee!.course_id)
      .order('hole_number');
    const holeNumbers = (courseHoles ?? []).map((h) => h.hole_number as number);
    expect(holeNumbers.length, 'course has holes seeded').toBeGreaterThan(0);
    const scoreRows = holeNumbers.flatMap((hole) => [
      {
        game_id: flightGameId!,
        user_id: adminUser!.id,
        hole_number: hole,
        strokes: 4,
        entered_by: adminUser!.id,
        client_updated_at: stampIso,
      },
      {
        game_id: flightGameId!,
        user_id: playerUser!.id,
        hole_number: hole,
        strokes: 5,
        entered_by: playerUser!.id,
        client_updated_at: stampIso,
      },
    ]);
    const { error: sErr } = await admin.from('scores').insert(scoreRows);
    expect(sErr).toBeNull();

    // Public liga page: standings render the numeric table (#647 read-path:
    // per-gender par), not the empty-state and not a 500.
    await page.goto('/login?next=/');
    await signInViaOtp(page, ADMIN_EMAIL!);
    await page.goto(`/liga/${leagueId}`);
    await expect(page.getByText('Noe gikk galt')).toHaveCount(0);
    await expect(page.getByTestId('liga-standings')).toBeVisible();
    await expect(
      page.getByTestId('liga-standings-row').first(),
    ).toBeVisible();
  });
});
