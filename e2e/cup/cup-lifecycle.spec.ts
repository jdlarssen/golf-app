import { test, expect } from '@playwright/test';
import {
  envReady,
  skipReason,
  adminClient,
  ADMIN_EMAIL,
  PLAYER_EMAIL,
  signInViaOtp,
  seedEphemeralPlayers,
  deleteEphemeralPlayers,
  type EphemeralPlayer,
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

/**
 * #736 (del A): full cup-livssyklus via den EKTE match-generatoren.
 *
 * Spec-en over seeder match-radene direkte. Denne driver den 5-stegs
 * generer-veiviseren via UI (test-id-ene fra denne PR-en) → den ekte,
 * ikke-atomiske `createCupMatchesFromPlan`-løkka som produserte #641, og
 * asserter at de PRODUSERTE radene har gyldig form (flight_number=1,
 * team_number 1/2, accepted_at satt, ingen foreldreløse game-rader). Lukker
 * deretter livssyklusen ved å aktivere cupen og asserte at den offentlige
 * leaderboarden rendrer.
 *
 * Veiviserens steg-1-gate bruker default-presetet (klassisk, minPerTeam=2), så
 * 4 spillere kreves for å starte i det hele tatt. Vi har bare 2 faste test-
 * brukere, så 2 EFEMERE brukere opprettes (og ryddes) for å nå gulvet.
 *
 * @lifecycle (IKKE @gate): driver en PPR-tung admin-veiviser + oppretter/sletter
 * auth-brukere på den delte staging-DB-en. For mye feil-flate til å gate hver
 * merge på — den seedede smoke-testen over forblir @gate-lese-sti-vakten, og
 * unit-testen i `generer/actions.test.ts` dekker write-shapet. Denne gir den
 * ekte ende-til-ende-integrasjonen av write-stien, kjørt via `e2e:lifecycle`.
 */
test.describe('Cup lifecycle — real generator via wizard (#736)', () => {
  test.skip(!envReady, skipReason);
  test.slow();

  let tournamentId: string | null = null;
  let ephemerals: EphemeralPlayer[] = [];

  test.afterAll(async () => {
    const admin = adminClient();
    if (tournamentId) {
      await admin.from('games').delete().eq('tournament_id', tournamentId);
      await admin.from('tournaments').delete().eq('id', tournamentId);
    }
    await deleteEphemeralPlayers(ephemerals.map((e) => e.id));
  });

  test('admin drives the 4-step wizard → real createCupMatchesFromPlan → valid rows + leaderboard @lifecycle', async ({
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

    // 2 ephemeral players → 4 total (2 per team) to clear the wizard's
    // klassisk-default step-1 gate.
    ephemerals = await seedEphemeralPlayers(2);
    const [eph1, eph2] = ephemerals;

    // Seed a DRAFT personal cup (no group_id → admin roster = all completed users).
    const stamp = Date.now();
    const cupName = `TEST-Cup-wizard-${stamp}`;
    const { data: cup, error: cupErr } = await admin
      .from('tournaments')
      .insert({
        name: cupName,
        team_1_name: 'Lag A',
        team_2_name: 'Lag B',
        points_to_win: 1.5,
        status: 'draft',
        created_by: adminUser!.id,
      })
      .select('id')
      .single<{ id: string }>();
    expect(cupErr).toBeNull();
    tournamentId = cup!.id;

    // ── Drive the wizard ────────────────────────────────────────────────────
    await page.goto(`/login?next=/admin/cup/${tournamentId}/generer`);
    await signInViaOtp(page, ADMIN_EMAIL!);
    await page.goto(`/admin/cup/${tournamentId}/generer`);

    // Step 1: 2 players per team (admin+eph1 = Lag A, player+eph2 = Lag B).
    await expect(page.getByTestId('cup-wizard-step1')).toBeVisible();
    await page.getByTestId(`cup-wizard-assign-${adminUser!.id}-team1`).click();
    await page.getByTestId(`cup-wizard-assign-${eph1.id}-team1`).click();
    await page.getByTestId(`cup-wizard-assign-${playerUser!.id}-team2`).click();
    await page.getByTestId(`cup-wizard-assign-${eph2.id}-team2`).click();
    await page.getByTestId('cup-wizard-next').click();

    // Step 2: course + tee.
    await expect(page.getByTestId('cup-wizard-step2')).toBeVisible();
    await page.getByTestId('cup-wizard-course').selectOption(tee!.course_id);
    await page.getByTestId('cup-wizard-tee').selectOption(tee!.id);
    await page.getByTestId('cup-wizard-next').click();

    // Step 3: singles-only preset + handicap pairing → 2 singles matches.
    await expect(page.getByTestId('cup-wizard-step3')).toBeVisible();
    await page.getByTestId('cup-wizard-preset-singler').check();
    await page.getByTestId('cup-wizard-strategy-handicap').check();
    await page.getByTestId('cup-wizard-next').click();

    // Step 4 (terminal): preview the generated matches, then confirm from the
    // same step → real createCupMatchesFromPlan → redirect to cup detail.
    await expect(page.getByTestId('cup-wizard-step4')).toBeVisible();
    await page.getByTestId('cup-wizard-generate').click();
    // Success redirects OFF /generer to the cup detail. An action error keeps us
    // on /generer with an error banner — so wait to LEAVE /generer.
    await expect(page, 'real generator redirected off /generer').not.toHaveURL(
      /\/generer/,
      { timeout: 25_000 },
    );

    // ── Assert the REAL generator output (the #641 write path) ───────────────
    const { data: matchGames } = await admin
      .from('games')
      .select('id, game_mode, status, tournament_id')
      .eq('tournament_id', tournamentId);
    expect(matchGames?.length, 'singler preset (2v2) → 2 singles matches').toBe(2);
    for (const g of matchGames!) {
      expect(g.game_mode).toBe('singles_matchplay');
      expect(g.status).toBe('scheduled');
    }

    const matchIds = matchGames!.map((g) => g.id as string);
    const { data: gps } = await admin
      .from('game_players')
      .select('game_id, user_id, team_number, flight_number, accepted_at')
      .in('game_id', matchIds);
    // 2 matches × 2 players, no #641 orphan (the insert used to set a phantom
    // `status` column and rejected every game_players row → 0 players).
    expect(gps?.length, 'every match got both players').toBe(4);
    for (const gp of gps!) {
      expect(gp.flight_number, 'flight_number=1 (team/flight CHECK)').toBe(1);
      expect([1, 2]).toContain(gp.team_number);
      expect(gp.accepted_at, 'players immediately accepted (#641 owner decision)').toBeTruthy();
    }
    // Each match has exactly one player per side.
    for (const id of matchIds) {
      const teams = (gps ?? [])
        .filter((g) => g.game_id === id)
        .map((g) => g.team_number);
      expect(new Set(teams)).toEqual(new Set([1, 2]));
    }

    // Admin cup detail rendered after the redirect (no error fallback).
    await expect(page.getByText(cupName).first()).toBeVisible();
    await expect(page.getByText('Noe gikk galt')).toHaveCount(0);

    // Close the lifecycle: activate the cup → public leaderboard renders.
    await admin
      .from('tournaments')
      .update({ status: 'active' })
      .eq('id', tournamentId);
    await page.goto(`/cup/${tournamentId}`);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(cupName);
    await expect(page.getByText('Noe gikk galt')).toHaveCount(0);
  });
});
