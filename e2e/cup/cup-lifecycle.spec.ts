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
 * Cup-livssyklus-smoke (#674, del 1) — reproduserer #642 (offentlig cup-
 * leaderboard 500 på per-kjønn-par) + #641-shape-klassen.
 *
 * Seeder en aktiv cup med én ekte match (singles_matchplay) + `game_players` i
 * NØYAKTIG produksjons-shapet `createCupMatchesFromPlan` skriver (validert mot
 * live-skjema: `game_players` har INGEN `status`-kolonne, `flight_number=1`,
 * `team_number` 1/2) + noen scores, og asserter at BÅDE admin-cup-detaljen og
 * den offentlige cup-leaderboarden rendrer cup-navnet — ikke #680-error-
 * fallbacken («Noe gikk galt») som en rå 500 nå ville utløst.
 *
 * Bevisst avvik fra issue-design: issue ba om å kalle den ekte
 * `createCupMatchesFromPlan` via UI. Den genereres av en 5-stegs wizard uten
 * test-id-er — for skjør å skrive blindt. Vi seeder i stedet match-radene med
 * samme shape (feil shape ⇒ seed-insert feiler ⇒ test rød), og dekker
 * #642-lese-stien som faktisk var 500-en. Generator-insert-stien dekkes av
 * unit-testen i `generer/actions.test.ts`. Env-gardet prod-DB-mønster.
 */
test.describe('Cup lifecycle smoke', () => {
  test.skip(!envReady, skipReason);
  test.slow();

  let tournamentId: string | null = null;

  test.afterAll(async () => {
    if (!tournamentId) return;
    const admin = adminClient();
    // games.tournament_id kan være SET NULL — slett match-games eksplisitt
    // (scores cascade) før selve turneringen.
    await admin.from('games').delete().eq('tournament_id', tournamentId);
    await admin.from('tournaments').delete().eq('id', tournamentId);
  });

  test('seeded cup renders admin detail + public leaderboard without a 500 @gate', async ({
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

    const stamp = Date.now();
    const cupName = `TEST-Cup-${stamp}`;
    const { data: cup, error: cupErr } = await admin
      .from('tournaments')
      .insert({
        name: cupName,
        team_1_name: 'Lag A',
        team_2_name: 'Lag B',
        points_to_win: 1.5,
        status: 'active',
        created_by: adminUser!.id,
      })
      .select('id')
      .single<{ id: string }>();
    expect(cupErr).toBeNull();
    tournamentId = cup!.id;

    // Én singles-match — samme shape som createCupMatchesFromPlan (ingen
    // status-kolonne på game_players; flight_number 1; team_number 1/2).
    const { data: matchGame, error: mErr } = await admin
      .from('games')
      .insert({
        name: `${cupName} – Singel 1`,
        course_id: tee!.course_id,
        tee_box_id: tee!.id,
        game_mode: 'singles_matchplay',
        mode_config: { kind: 'singles_matchplay', team_size: 1 },
        status: 'active',
        created_by: adminUser!.id,
        tournament_id: tournamentId,
        tournament_match_label: 'Singel 1',
      })
      .select('id')
      .single<{ id: string }>();
    expect(mErr).toBeNull();
    const matchId = matchGame!.id;

    const acceptedAt = new Date().toISOString();
    const { error: gpErr } = await admin.from('game_players').insert([
      {
        game_id: matchId,
        user_id: adminUser!.id,
        team_number: 1,
        flight_number: 1,
        course_handicap: 12,
        accepted_at: acceptedAt,
      },
      {
        game_id: matchId,
        user_id: playerUser!.id,
        team_number: 2,
        flight_number: 1,
        course_handicap: 18,
        accepted_at: acceptedAt,
      },
    ]);
    expect(gpErr, 'game_players insert (prod shape) must succeed').toBeNull();

    // Noen scores så cup-leaderboarden faktisk regner (treffer per-kjønn-par —
    // #642-stien) i stedet for å rendre tom.
    const clientUpdatedAt = new Date().toISOString();
    const scoreRows = [1, 2, 3].flatMap((hole) => [
      {
        game_id: matchId,
        user_id: adminUser!.id,
        hole_number: hole,
        strokes: 4,
        entered_by: adminUser!.id,
        client_updated_at: clientUpdatedAt,
      },
      {
        game_id: matchId,
        user_id: playerUser!.id,
        hole_number: hole,
        strokes: 5,
        entered_by: playerUser!.id,
        client_updated_at: clientUpdatedAt,
      },
    ]);
    const { error: sErr } = await admin.from('scores').insert(scoreRows);
    expect(sErr, 'scores insert must succeed').toBeNull();

    // Admin-cup-detaljen rendrer cup-navnet (ikke error-fallbacken).
    await page.goto(`/login?next=/admin/cup/${tournamentId}`);
    await signInViaOtp(page, ADMIN_EMAIL!);
    await page.goto(`/admin/cup/${tournamentId}`);
    await expect(page.getByText(cupName).first()).toBeVisible();
    await expect(page.getByText('Noe gikk galt')).toHaveCount(0);

    // Offentlig cup-leaderboard rendrer (#642-reproduser: per-kjønn-par).
    await page.goto(`/cup/${tournamentId}`);
    await expect(
      page.getByRole('heading', { level: 1 }),
    ).toContainText(cupName);
    await expect(page.getByText('Noe gikk galt')).toHaveCount(0);
  });
});
