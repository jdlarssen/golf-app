import { test, expect } from '@playwright/test';
import {
  envReady,
  skipReason,
  adminClient,
  ADMIN_EMAIL,
  PLAYER_EMAIL,
  signInViaOtp,
  cleanupE2eNotifications,
} from '../_helpers/games';
import { SIM_SETTING_DEFAULTS } from '@/lib/league/simSettings';

/** #2638: a simulator league's default round settings (Trackman's defaults, wind Breezy). */
const SIM_DEFAULT = { ...SIM_SETTING_DEFAULTS, wind: 'BREEZY' };

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
    // #1272: rydd gamle e2e-notifikasjoner (denne spec-en kaller ikke
    // cleanupTestGame, så den varige purgen wires inn her). Best-effort.
    await cleanupE2eNotifications();
  });

  test('a delivered finished flight makes the standings table render numbers @gate', async ({
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
    await expect(page.getByTestId('error-screen')).toHaveCount(0);
    await expect(page.getByTestId('liga-standings')).toBeVisible();
    await expect(
      page.getByTestId('liga-standings-row').first(),
    ).toBeVisible();
  });
});

/**
 * #736 (del B): full liga-livssyklus via den EKTE flight-generatoren.
 *
 * De to spec-ene over seeder flight-radene direkte. Denne driver
 * `RoundStartClient` via UI → den ekte `startLeagueRoundFlight` (samme ikke-
 * atomiske insert + `startScheduledGame`-løkke som produserte #647), og
 * asserter at den produserte flighten har gyldig form (#647: `team_number` null,
 * ingen `status`-kolonne, `league_round_id` satt). Deretter lukkes livssyklusen
 * via service-role (scores + finish) og standings-tabellen asserteres å rendre
 * tall — slik at en regresjon i generatoren feiler testen i stedet for å bli
 * usynlig. Env-gardet, kjører mot staging.
 */
test.describe('Liga — real flight generator via UI (#736)', () => {
  test.skip(!envReady, skipReason);
  test.slow();

  let leagueId: string | null = null;
  let flightGameId: string | null = null;

  test.afterAll(async () => {
    const admin = adminClient();
    if (flightGameId) await admin.from('games').delete().eq('id', flightGameId);
    if (leagueId) await admin.from('leagues').delete().eq('id', leagueId);
    // #1272: rydd gamle e2e-notifikasjoner (denne spec-en kaller ikke
    // cleanupTestGame, så den varige purgen wires inn her). Best-effort.
    await cleanupE2eNotifications();
  });

  test('admin drives RoundStartClient → real startLeagueRoundFlight → valid flight + standings render @gate', async ({
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

    // Seed an ACTIVE league + OPEN round + both participants. The flight is NOT
    // seeded — the real generator creates it.
    const now = Date.now();
    const day = 86_400_000;
    const { data: league, error: lErr } = await admin
      .from('leagues')
      .insert({
        name: `TEST-Liga-realgen-${now}`,
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

    // ── Drive the real generator through the round-start UI ─────────────────
    await page.goto(`/login?next=/liga/${leagueId}/runde/${roundId}/spill`);
    await signInViaOtp(page, ADMIN_EMAIL!);
    await page.goto(`/liga/${leagueId}/runde/${roundId}/spill`);

    // #1272: kald Turbopack-kompilering av round-start-ruta kan alene spise
    // titalls sekunder, så knappen er ikke montert ved goto. Vent eksplisitt på
    // synlighet (30s headroom) før klikk — et rått klikk her var @gate-flaken på
    // liga:402.
    const startPlayerBtn = page.getByTestId(
      `liga-round-start-player-${playerUser!.id}`,
    );
    await expect(startPlayerBtn).toBeVisible({ timeout: 30_000 });
    await startPlayerBtn.click();
    await page.getByTestId('liga-round-start-submit').click();

    // Real startLeagueRoundFlight redirects to /games/{flightId} on success.
    await expect(page).toHaveURL(/\/games\/[0-9a-f-]{36}/, { timeout: 25_000 });

    // ── Assert the REAL generator output is the valid #647 shape ─────────────
    const { data: flights } = await admin
      .from('games')
      .select('id, status, game_mode, league_round_id, created_at')
      .eq('league_round_id', roundId)
      .order('created_at', { ascending: false })
      .limit(1);
    expect(flights?.length, 'generator created a flight game').toBe(1);
    const flight = flights![0] as {
      id: string;
      status: string;
      game_mode: string;
      league_round_id: string;
    };
    flightGameId = flight.id;
    expect(flight.game_mode, 'stroke league → solo_strokeplay flight').toBe(
      'solo_strokeplay',
    );
    expect(flight.league_round_id).toBe(roundId);

    const { data: gps } = await admin
      .from('game_players')
      .select('user_id, team_number, flight_number')
      .eq('game_id', flightGameId);
    expect(gps?.length, 'flight has both players (no #647 rejected insert)').toBe(
      2,
    );
    for (const gp of gps!) {
      // #647: liga is solo → team_number MUST be null (team_number set without
      // flight_number broke the consistency CHECK and rejected the whole insert).
      expect(gp.team_number, 'solo flight: team_number null').toBeNull();
    }
    expect(new Set((gps ?? []).map((g) => g.user_id))).toEqual(
      new Set([adminUser!.id, playerUser!.id]),
    );

    // ── Close the lifecycle via service-role: full round + finish ───────────
    const { data: courseHoles } = await admin
      .from('course_holes')
      .select('hole_number')
      .eq('course_id', tee!.course_id)
      .order('hole_number');
    const holeNumbers = (courseHoles ?? []).map((h) => h.hole_number as number);
    expect(holeNumbers.length, 'course has holes').toBeGreaterThan(0);

    await admin
      .from('game_players')
      .update({
        accepted_at: stampIso,
        submitted_at: stampIso,
        approved_at: stampIso,
      })
      .eq('game_id', flightGameId);

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
    await admin.from('games').update({ status: 'finished' }).eq('id', flightGameId);

    // Standings table renders numbers, not the empty-state and not a 500.
    await page.goto(`/liga/${leagueId}`);
    await expect(page.getByTestId('error-screen')).toHaveCount(0);
    await expect(page.getByTestId('liga-standings')).toBeVisible();
    await expect(
      page.getByTestId('liga-standings-row').first(),
    ).toBeVisible();
  });
});

/**
 * #2638: a simulator league lets a player take the round alone. Same drive as
 * #736 above, but nobody is ticked: the real startLeagueRoundFlight starts a
 * flight of one, freezes the league default into the round (0214), and once
 * the card is delivered and the flight finished, the one-player flight counts
 * on the table (a regular league would leave the row empty).
 */
test.describe('Liga — simulator: a flight of one counts (#2638)', () => {
  test.skip(!envReady, skipReason);
  test.slow();

  let leagueId: string | null = null;
  let flightGameId: string | null = null;

  test.afterAll(async () => {
    const admin = adminClient();
    if (flightGameId) await admin.from('games').delete().eq('id', flightGameId);
    if (leagueId) await admin.from('leagues').delete().eq('id', leagueId);
    await cleanupE2eNotifications();
  });

  test('a player starts a simulator round alone, and the delivered card counts @gate', async ({ page }) => {
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
      .not('slope_mens', 'is', null)
      .limit(1)
      .maybeSingle<{ id: string; course_id: string }>();
    expect(tee, 'a tee with a mens rating').toBeTruthy();

    const now = Date.now();
    const day = 86_400_000;
    const { data: league, error: lErr } = await admin
      .from('leagues')
      .insert({
        name: `TEST-Liga-simulator-${now}`,
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
        is_simulator: true,
        sim_settings: SIM_DEFAULT,
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
        closes_at: new Date(now + 14 * day).toISOString(),
        original_closes_at: new Date(now + 14 * day).toISOString(),
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

    // ── Start without a flightmate: the submit waits for the Trackman
    // confirmation (#2666), and nobody has to be ticked ───────────────────────
    await page.goto(`/login?next=/liga/${leagueId}/runde/${roundId}/spill`);
    await signInViaOtp(page, ADMIN_EMAIL!);
    await page.goto(`/liga/${leagueId}/runde/${roundId}/spill`);
    const submit = page.getByTestId('liga-round-start-submit');
    await expect(page.getByTestId('round-setup-checklist')).toBeVisible({ timeout: 30_000 });
    await expect(submit).toBeDisabled();
    await page.getByTestId('liga-round-start-confirm').click();
    await expect(submit).toBeEnabled();
    await submit.click();
    await expect(page).toHaveURL(/\/games\/[0-9a-f-]{36}/, { timeout: 25_000 });

    const { data: flights } = await admin
      .from('games')
      .select('id')
      .eq('league_round_id', roundId);
    expect(flights?.length, 'one flight').toBe(1);
    flightGameId = (flights![0] as { id: string }).id;

    const { data: gps } = await admin
      .from('game_players')
      .select('user_id')
      .eq('game_id', flightGameId);
    expect((gps ?? []).map((g) => g.user_id), 'a flight of one').toEqual([adminUser!.id]);

    const { data: frozen } = await admin
      .from('league_rounds')
      .select('sim_settings, sim_frozen_default')
      .eq('id', roundId)
      .single<{ sim_settings: unknown; sim_frozen_default: unknown }>();
    expect(frozen, 'the first start froze the default and left the override alone').toEqual({
      sim_settings: null,
      sim_frozen_default: SIM_DEFAULT,
    });

    // ── Deliver and finish via service role, then the table counts it ──────
    const { data: courseHoles } = await admin
      .from('course_holes')
      .select('hole_number')
      .eq('course_id', tee!.course_id)
      .order('hole_number');
    const holeNumbers = (courseHoles ?? []).map((h) => h.hole_number as number);
    expect(holeNumbers.length, 'course has holes').toBeGreaterThan(0);

    await admin
      .from('game_players')
      .update({ accepted_at: stampIso, submitted_at: stampIso, approved_at: stampIso })
      .eq('game_id', flightGameId);
    const { error: sErr } = await admin.from('scores').insert(
      holeNumbers.map((hole) => ({
        game_id: flightGameId!,
        user_id: adminUser!.id,
        hole_number: hole,
        strokes: 4,
        entered_by: adminUser!.id,
        client_updated_at: stampIso,
      })),
    );
    expect(sErr).toBeNull();
    await admin.from('games').update({ status: 'finished' }).eq('id', flightGameId);

    await page.goto(`/liga/${leagueId}`);
    await expect(page.getByTestId('error-screen')).toHaveCount(0);
    await expect(page.getByTestId('liga-standings')).toBeVisible();
    await expect(page.getByTestId('liga-played-by-delivered')).toBeVisible();
    await expect(page.getByTestId('liga-played-by-missing')).toBeVisible();
  });
});

/**
 * #2638 (the orchestrator's review, finding 1 and 2): the two settings forms
 * keep what the organiser saved. React 19 resets a form after an `action`
 * submit, and the selects held their own state from mount; together a second
 * «Lagre» posted the old values. Drives the real admin page: the default is
 * saved twice without a reload, then a round is adjusted, reset and saved.
 */
test.describe('Liga — simulator: the settings forms keep what was saved (#2638)', () => {
  test.skip(!envReady, skipReason);
  test.slow();

  let leagueId: string | null = null;

  test.afterAll(async () => {
    if (leagueId) await adminClient().from('leagues').delete().eq('id', leagueId);
  });

  test('save the default twice, then reset a round and save it @gate', async ({ page }) => {
    const admin = adminClient();
    const { data: adminUser } = await admin
      .from('users')
      .select('id')
      .ilike('email', ADMIN_EMAIL!)
      .maybeSingle<{ id: string }>();
    expect(adminUser, 'admin user seeded').toBeTruthy();
    const { data: tee } = await admin
      .from('tee_boxes')
      .select('id, course_id')
      .not('par_total_mens', 'is', null)
      .limit(1)
      .maybeSingle<{ id: string; course_id: string }>();
    expect(tee, 'a tee').toBeTruthy();

    const now = Date.now();
    const day = 86_400_000;
    const { data: league, error: lErr } = await admin
      .from('leagues')
      .insert({
        name: `TEST-Liga-simskjema-${now}`,
        season_start: new Date(now - day).toISOString().slice(0, 10),
        season_end: new Date(now + 30 * day).toISOString().slice(0, 10),
        format: 'stableford',
        scoring: 'net',
        standings_model: 'total',
        course_scope: 'single_course_single_tee',
        course_id: tee!.course_id,
        tee_box_id: tee!.id,
        status: 'active',
        created_by: adminUser!.id,
        is_simulator: true,
        sim_settings: SIM_DEFAULT,
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
        opens_at: new Date(now + day).toISOString(),
        closes_at: new Date(now + 14 * day).toISOString(),
        original_closes_at: new Date(now + 14 * day).toISOString(),
      })
      .select('id')
      .single<{ id: string }>();
    expect(rErr).toBeNull();
    const roundId = round!.id;
    await admin
      .from('league_players')
      .insert({ league_id: leagueId, user_id: adminUser!.id, accepted_at: new Date().toISOString() });

    const leagueSettings = async () =>
      (await admin.from('leagues').select('sim_settings').eq('id', leagueId!).single()).data
        ?.sim_settings as Record<string, string> | null;
    const roundOverride = async () =>
      (await admin.from('league_rounds').select('sim_settings').eq('id', roundId).single()).data
        ?.sim_settings ?? null;

    await page.goto(`/login?next=/admin/liga/${leagueId}`);
    await signInViaOtp(page, ADMIN_EMAIL!);
    await page.goto(`/admin/liga/${leagueId}`);

    // ── The default, saved twice without a reload ────────────────────────────
    // Each save is waited out (the button is enabled again) before the next
    // choice: the fields are disabled while saving (the orchestrator's check).
    const defaults = page.getByTestId('liga-sim-defaults');
    const defaultsSave = defaults.getByTestId('liga-sim-defaults-save');
    const stimp = defaults.getByTestId('sim-select-green_stimp');
    // The settings are folded to one line (the owner 25.10); open them first.
    await defaults.getByTestId('liga-sim-defaults-disclosure-summary').click({ timeout: 30_000 });
    await expect(stimp).toHaveValue(SIM_DEFAULT.green_stimp, { timeout: 30_000 });
    await stimp.selectOption('11');
    await defaultsSave.click();
    await expect.poll(async () => (await leagueSettings())?.green_stimp, { timeout: 20_000 }).toBe('11');
    await expect(defaultsSave).toBeEnabled({ timeout: 20_000 });
    await expect(stimp, 'the select keeps the saved value').toHaveValue('11');

    await defaults.getByTestId('sim-select-wind').selectOption('CALM');
    await defaultsSave.click();
    await expect.poll(async () => (await leagueSettings())?.wind, { timeout: 20_000 }).toBe('CALM');
    expect((await leagueSettings())?.green_stimp, 'the second save kept the first change').toBe('11');
    await expect(defaultsSave).toBeEnabled({ timeout: 20_000 });

    // ── The round: adjust, back to the default, adjust again ────────────────
    const adjust = page.getByTestId('liga-round-adjust').first();
    const roundSave = adjust.getByTestId('liga-round-settings-save');
    await adjust.locator('summary').click();
    await expect(adjust.getByTestId('sim-select-green_stimp'), 'the round follows the new default').toHaveValue('11');
    await expect(adjust.getByTestId('liga-round-reset'), 'no override, no «Tilbake til standard»').toHaveCount(0);
    await adjust.getByTestId('sim-select-green_stimp').selectOption('13');
    await roundSave.click();
    await expect.poll(roundOverride, { timeout: 20_000 }).toEqual({ green_stimp: '13' });
    await expect(roundSave).toBeEnabled({ timeout: 20_000 });

    await adjust.getByTestId('liga-round-reset').click();
    await expect.poll(roundOverride, { timeout: 20_000 }).toBeNull();
    await expect(roundSave).toBeEnabled({ timeout: 20_000 });
    await expect(adjust.getByTestId('sim-select-green_stimp'), 'the reset shows the default again').toHaveValue('11');

    await adjust.getByTestId('sim-select-wind').selectOption('WINDY');
    await roundSave.click();
    await expect.poll(roundOverride, { timeout: 20_000 }).toEqual({ wind: 'WINDY' });
  });
});
