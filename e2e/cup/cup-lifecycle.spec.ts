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

    // Offentlig cup-side rendrer kampene (#642-reproduser: per-kjønn-par).
    await page.goto(`/cup/${tournamentId}`);
    await expect(
      page.getByRole('heading', { level: 1 }),
    ).toContainText(cupName);
    await expect(page.getByText('Noe gikk galt')).toHaveCount(0);

    // Resultatsiden er låst mens cupen er aktiv (#1468) — ventetekst, ingen
    // resultatdata (verken totaler eller vinner-banner).
    await page.goto(`/cup/${tournamentId}/resultater`);
    await expect(page.getByTestId('cup-results-locked')).toBeVisible();
    await expect(page.getByTestId('cup-results-totals')).toHaveCount(0);
  });
});

/**
 * #736 (del A): full cup-livssyklus via den EKTE match-generatoren.
 *
 * Spec-en over seeder match-radene direkte. Denne driver hele tre-roms-flyten
 * (#1472) via UI: Oppsett-rommet (plan: bane/tee/preset/strategi persistert i
 * `tournament_plans`) → Spillere-rommet (deltakerliste i
 * `tournament_participants`) → to-stegs generer-veiviseren → den ekte,
 * ikke-atomiske `createCupMatchesFromPlan`-løkka som produserte #641, og
 * asserter at de PRODUSERTE radene har gyldig form (flight_number=1,
 * team_number 1/2, accepted_at satt, bane/tee fra LAGRET plan, ingen
 * foreldreløse game-rader). Lukker deretter livssyklusen ved å aktivere cupen
 * og asserte at den offentlige leaderboarden rendrer.
 *
 * Veiviserens steg-1-gate bruker planens preset (her: singler, minPerTeam=1),
 * men 2v2 gir to singles-matcher — 2 EFEMERE brukere opprettes (og ryddes) i
 * tillegg til de 2 faste test-brukerne.
 *
 * @lifecycle (IKKE @gate): driver en PPR-tung admin-flyt + oppretter/sletter
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

  test('admin drives three rooms → 2-step wizard → real createCupMatchesFromPlan → valid rows + leaderboard @lifecycle', async ({
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

    // ── Rom 1: Oppsett — plan persistert server-side (#1472) ────────────────
    await page.goto(`/login?next=/admin/cup/${tournamentId}/oppsett`);
    await signInViaOtp(page, ADMIN_EMAIL!);
    await page.goto(`/admin/cup/${tournamentId}/oppsett`);

    await expect(page.getByTestId('cup-plan-course')).toBeVisible();
    await page.getByTestId('cup-plan-course').selectOption(tee!.course_id);
    await page.getByTestId('cup-plan-tee').selectOption(tee!.id);
    // Singles-only preset + handicap pairing → 2 singles matches ved 2v2.
    await page.getByTestId('cup-plan-preset-singler').check();
    await page.getByTestId('cup-plan-strategy-handicap').check();
    await page.getByTestId('cup-plan-save').click();
    // Suksess redirecter til cup-detaljen; feil blir på /oppsett med banner.
    await expect(page, 'plan save redirected off /oppsett').not.toHaveURL(
      /\/oppsett/,
      { timeout: 25_000 },
    );

    // ── Rom 2: Spillere — deltakerliste persistert (#1472) ──────────────────
    await page.goto(`/admin/cup/${tournamentId}/spillere`);
    for (const id of [adminUser!.id, eph1.id, playerUser!.id, eph2.id]) {
      await page.getByTestId(`cup-participants-add-${id}`).click();
      // Add-en er en server-action + redirect; raden flytter til påmeldt-lista.
      await expect(
        page.getByTestId(`cup-participants-remove-${id}`),
      ).toBeVisible({ timeout: 25_000 });
    }

    // ── Rom 3: Fordel & generer — to-stegs veiviser over deltakerlista ──────
    await page.goto(`/admin/cup/${tournamentId}/generer`);

    // Steg 1: 2 spillere per lag (admin+eph1 = Lag A, player+eph2 = Lag B).
    await expect(page.getByTestId('cup-wizard-step1')).toBeVisible();
    await page.getByTestId(`cup-wizard-assign-${adminUser!.id}-team1`).click();
    await page.getByTestId(`cup-wizard-assign-${eph1.id}-team1`).click();
    await page.getByTestId(`cup-wizard-assign-${playerUser!.id}-team2`).click();
    await page.getByTestId(`cup-wizard-assign-${eph2.id}-team2`).click();
    await page.getByTestId('cup-wizard-next').click();

    // Steg 2 (terminalt): preview av genererte matcher + generer-knappen →
    // real createCupMatchesFromPlan (leser planen server-side) → redirect.
    await expect(page.getByTestId('cup-wizard-step2')).toBeVisible();
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
      .select('id, game_mode, status, tournament_id, course_id, tee_box_id, scheduled_tee_off_at')
      .eq('tournament_id', tournamentId);
    expect(matchGames?.length, 'singler preset (2v2) → 2 singles matches').toBe(2);
    for (const g of matchGames!) {
      expect(g.game_mode).toBe('singles_matchplay');
      expect(g.status).toBe('scheduled');
      // #1472: bane/tee kommer fra den LAGREDE planen, ikke klient-payloaden;
      // tee-off stod tomt i Oppsett-rommet → NULL på matchene.
      expect(g.course_id, 'course from stored plan').toBe(tee!.course_id);
      expect(g.tee_box_id, 'tee from stored plan').toBe(tee!.id);
      expect(g.scheduled_tee_off_at, 'no tee-off set in plan').toBeNull();
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

/**
 * #1501: cup-avslutning i ETT trykk. Seeder en aktiv cup med én host-kamp der
 * begge scorekort er levert (og ingen sidepoeng konfigurert, så gaten er
 * trivielt grønn), åpner styringssiden, trykker ÉN gang på «Avslutt cupen» og
 * verifiserer via SQL-orakler at BÅDE host-kampen og cupen ble `finished` — det
 * hullet #1468-prod-testen avdekket (cup avsluttet med kampene urørt).
 *
 * Golden path via data-testid (`cup-finish-submit`) — ingen norsk-copy-
 * assertions. @lifecycle: driver den ekte endGame-pipelinen per kamp
 * (resultatsammendrag, differensialer, best-effort mail) på delt staging-DB.
 */
test.describe('Cup one-tap finish (#1501)', () => {
  test.skip(!envReady, skipReason);
  test.slow();

  let tournamentId: string | null = null;

  test.afterAll(async () => {
    if (!tournamentId) return;
    const admin = adminClient();
    await admin.from('games').delete().eq('tournament_id', tournamentId);
    await admin.from('tournaments').delete().eq('id', tournamentId);
  });

  test('one tap finishes every host match and the cup @lifecycle', async ({
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
    const cupName = `TEST-Cup-onetap-${stamp}`;
    const { data: cup, error: cupErr } = await admin
      .from('tournaments')
      .insert({
        name: cupName,
        team_1_name: 'Lag A',
        team_2_name: 'Lag B',
        points_to_win: 1,
        status: 'active',
        created_by: adminUser!.id,
      })
      .select('id')
      .single<{ id: string }>();
    expect(cupErr).toBeNull();
    tournamentId = cup!.id;

    // One active singles host match. require_peer_approval=false so a delivered
    // scorecard is enough for the finish gate (peer-approval is never relaxed —
    // out of scope for the golden path).
    const { data: matchGame, error: mErr } = await admin
      .from('games')
      .insert({
        name: `${cupName} – Singel 1`,
        course_id: tee!.course_id,
        tee_box_id: tee!.id,
        game_mode: 'singles_matchplay',
        mode_config: { kind: 'singles_matchplay', team_size: 1 },
        status: 'active',
        require_peer_approval: false,
        created_by: adminUser!.id,
        tournament_id: tournamentId,
        tournament_match_label: 'Singel 1',
      })
      .select('id')
      .single<{ id: string }>();
    expect(mErr).toBeNull();
    const matchId = matchGame!.id;

    // Both players delivered (submitted_at set) → «Scorekort levert» + the
    // finish gate passes without «Avslutt likevel».
    const submittedAt = new Date().toISOString();
    const { error: gpErr } = await admin.from('game_players').insert([
      {
        game_id: matchId,
        user_id: adminUser!.id,
        team_number: 1,
        flight_number: 1,
        course_handicap: 12,
        accepted_at: submittedAt,
        submitted_at: submittedAt,
      },
      {
        game_id: matchId,
        user_id: playerUser!.id,
        team_number: 2,
        flight_number: 1,
        course_handicap: 18,
        accepted_at: submittedAt,
        submitted_at: submittedAt,
      },
    ]);
    expect(gpErr, 'game_players insert must succeed').toBeNull();

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

    // Drive the one tap on the admin cup-detail page.
    await page.goto(`/login?next=/admin/cup/${tournamentId}`);
    await signInViaOtp(page, ADMIN_EMAIL!);
    await page.goto(`/admin/cup/${tournamentId}`);

    const finishButton = page.getByTestId('cup-finish-submit');
    await expect(finishButton).toBeVisible();
    await expect(finishButton).toBeEnabled();
    await finishButton.click();

    // Success redirects back to the cup detail with ?status=finished.
    await page.waitForURL(/status=finished/, { timeout: 30_000 });

    // SQL oracles: BOTH the host match and the cup are finished (the #1468 hole
    // was the cup flipping while the match stayed active).
    const { data: finishedGame } = await admin
      .from('games')
      .select('status')
      .eq('id', matchId)
      .maybeSingle<{ status: string }>();
    expect(finishedGame?.status, 'host match finished by the one tap').toBe('finished');

    const { data: finishedCup } = await admin
      .from('tournaments')
      .select('status, winner_team')
      .eq('id', tournamentId)
      .maybeSingle<{ status: string; winner_team: number | null }>();
    expect(finishedCup?.status, 'cup finished').toBe('finished');

    // The public cup page now shows the results door (finished state).
    await page.goto(`/cup/${tournamentId}`);
    await expect(page.getByTestId('cup-results-door')).toBeVisible();
  });
});

/**
 * #1488 (K9): one-tap finish over a SPLIT-DAY bundle (#1441-form) — 2 host
 * matches (front9/back9 segments, `source_game_id IS NULL`) + 2 derived matches
 * (`source_game_id` → their host). A derived match owns no submissions of its
 * own; #1488 (K4) makes it INHERIT its host's «Scorekort levert»-status instead
 * of showing «Pågår» forever. This test seeds that shape directly (same rows the
 * generator's two-pass loop produces), asserts via a language-independent
 * `data-status` oracle that the derived matches read «delivered» BEFORE the
 * finish, then drives the one tap and SQL-oracles that ALL 4 games + the cup are
 * `finished` (the derived pair follows via `finishDerivedGames`).
 *
 * @lifecycle (not @gate): drives the real per-host endGame pipeline on the
 * shared staging DB, same reasoning as the #1501 one-tap test above.
 */
test.describe('Cup one-tap finish — split-day bundle (#1488 K9)', () => {
  test.skip(!envReady, skipReason);
  test.slow();

  let tournamentId: string | null = null;

  test.afterAll(async () => {
    if (!tournamentId) return;
    const admin = adminClient();
    // Every game (host + derived) carries tournament_id, so this catches the
    // whole bundle; scores cascade on the games delete.
    await admin.from('games').delete().eq('tournament_id', tournamentId);
    await admin.from('tournaments').delete().eq('id', tournamentId);
  });

  test('derived matches read delivered before finish; one tap finishes all 4 games + cup @lifecycle', async ({
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
    const cupName = `TEST-Cup-split-${stamp}`;
    const { data: cup, error: cupErr } = await admin
      .from('tournaments')
      .insert({
        name: cupName,
        team_1_name: 'Lag A',
        team_2_name: 'Lag B',
        points_to_win: 1,
        status: 'active',
        created_by: adminUser!.id,
      })
      .select('id')
      .single<{ id: string }>();
    expect(cupErr).toBeNull();
    tournamentId = cup!.id;

    // Insert one bundle match (games-row + both game_players). `sourceGameId`
    // set → derived (no submissions of its own; inherits its host). `submitted`
    // controls whether the players delivered — hosts true, derived false.
    async function seedMatch(opts: {
      label: string;
      segment: 'front9' | 'back9';
      sourceGameId: string | null;
      submitted: boolean;
    }): Promise<string> {
      const { data: game, error: gErr } = await admin
        .from('games')
        .insert({
          name: `${cupName} – ${opts.label}`,
          course_id: tee!.course_id,
          tee_box_id: tee!.id,
          game_mode: 'singles_matchplay',
          mode_config: { kind: 'singles_matchplay', team_size: 1 },
          status: 'active',
          require_peer_approval: false,
          created_by: adminUser!.id,
          tournament_id: tournamentId,
          tournament_match_label: opts.label,
          hole_segment: opts.segment,
          score_visibility: 'reveal',
          ...(opts.sourceGameId ? { source_game_id: opts.sourceGameId } : {}),
        })
        .select('id')
        .single<{ id: string }>();
      expect(gErr, `game insert (${opts.label}) must succeed`).toBeNull();
      const gameId = game!.id;

      const ts = new Date().toISOString();
      const { error: gpErr } = await admin.from('game_players').insert([
        {
          game_id: gameId,
          user_id: adminUser!.id,
          team_number: 1,
          flight_number: 1,
          course_handicap: 12,
          accepted_at: ts,
          // Derived players never deliver a card of their own (the K4 scenario).
          submitted_at: opts.submitted ? ts : null,
        },
        {
          game_id: gameId,
          user_id: playerUser!.id,
          team_number: 2,
          flight_number: 1,
          course_handicap: 18,
          accepted_at: ts,
          submitted_at: opts.submitted ? ts : null,
        },
      ]);
      expect(gpErr, `game_players insert (${opts.label}) must succeed`).toBeNull();
      return gameId;
    }

    // 2 hosts (front9 + back9), both delivered. Then 2 derived pointing at them,
    // neither delivered on its own row.
    const hostFrontId = await seedMatch({
      label: 'Front 1',
      segment: 'front9',
      sourceGameId: null,
      submitted: true,
    });
    const hostBackId = await seedMatch({
      label: 'Back 1',
      segment: 'back9',
      sourceGameId: null,
      submitted: true,
    });
    const derivedFromFrontId = await seedMatch({
      label: 'Singel back9 A',
      segment: 'back9',
      sourceGameId: hostFrontId,
      submitted: false,
    });
    const derivedFromBackId = await seedMatch({
      label: 'Singel front9 B',
      segment: 'front9',
      sourceGameId: hostBackId,
      submitted: false,
    });

    // Scores live on the hosts (derived read via source_game_id). Front9 host
    // scores on holes 1–3, back9 host on holes 10–12.
    const clientUpdatedAt = new Date().toISOString();
    const scoreRows = [
      ...[1, 2, 3].flatMap((hole) => [
        { game_id: hostFrontId, user_id: adminUser!.id, hole_number: hole, strokes: 4, entered_by: adminUser!.id, client_updated_at: clientUpdatedAt },
        { game_id: hostFrontId, user_id: playerUser!.id, hole_number: hole, strokes: 5, entered_by: playerUser!.id, client_updated_at: clientUpdatedAt },
      ]),
      ...[10, 11, 12].flatMap((hole) => [
        { game_id: hostBackId, user_id: adminUser!.id, hole_number: hole, strokes: 4, entered_by: adminUser!.id, client_updated_at: clientUpdatedAt },
        { game_id: hostBackId, user_id: playerUser!.id, hole_number: hole, strokes: 5, entered_by: playerUser!.id, client_updated_at: clientUpdatedAt },
      ]),
    ];
    const { error: sErr } = await admin.from('scores').insert(scoreRows);
    expect(sErr, 'scores insert must succeed').toBeNull();

    // Open the admin cup detail.
    await page.goto(`/login?next=/admin/cup/${tournamentId}`);
    await signInViaOtp(page, ADMIN_EMAIL!);
    await page.goto(`/admin/cup/${tournamentId}`);
    await expect(page.getByText(cupName).first()).toBeVisible();

    // K4 oracle: the DERIVED matches read «delivered» (scorecardsSubmitted) even
    // though their own game_players never submitted — they inherit the host.
    // Language-independent via data-status, never Norwegian copy.
    for (const derivedId of [derivedFromFrontId, derivedFromBackId]) {
      await expect(
        page.getByTestId(`cup-match-status-${derivedId}`),
      ).toHaveAttribute('data-status', 'scorecardsSubmitted');
    }
    // Hosts read delivered too (sanity — they actually submitted).
    for (const hostId of [hostFrontId, hostBackId]) {
      await expect(
        page.getByTestId(`cup-match-status-${hostId}`),
      ).toHaveAttribute('data-status', 'scorecardsSubmitted');
    }

    // One tap finishes the cup.
    const finishButton = page.getByTestId('cup-finish-submit');
    await expect(finishButton).toBeVisible();
    await expect(finishButton).toBeEnabled();
    await finishButton.click();
    await page.waitForURL(/status=finished/, { timeout: 30_000 });

    // SQL oracles: all 4 games AND the cup are finished (the derived pair
    // followed their hosts via finishDerivedGames).
    const { data: games } = await admin
      .from('games')
      .select('id, status')
      .eq('tournament_id', tournamentId)
      .returns<{ id: string; status: string }[]>();
    expect(games?.length, 'all 4 bundle games present').toBe(4);
    for (const g of games!) {
      expect(g.status, `game ${g.id} finished by the one tap`).toBe('finished');
    }

    const { data: finishedCup } = await admin
      .from('tournaments')
      .select('status')
      .eq('id', tournamentId)
      .maybeSingle<{ status: string }>();
    expect(finishedCup?.status, 'cup finished').toBe('finished');
  });
});

test.describe('Cup self-signup via shared link (#1490)', () => {
  test.skip(!envReady, skipReason);
  test.slow();

  let tournamentId: string | null = null;

  test.afterAll(async () => {
    if (!tournamentId) return;
    const admin = adminClient();
    // tournament_participants har ON DELETE CASCADE fra tournaments (0155),
    // så turneringsslettingen tar deltakerraden med seg.
    await admin.from('games').delete().eq('tournament_id', tournamentId);
    await admin.from('tournaments').delete().eq('id', tournamentId);
  });

  test('organiser shares the link, player signs themselves up and out again @lifecycle', async ({
    browser,
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

    // Draft personal cup — the only state signups are open in.
    const stamp = Date.now();
    const cupName = `TEST-Cup-bli-med-${stamp}`;
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
      .select('id, short_id')
      .single<{ id: string; short_id: string }>();
    expect(cupErr).toBeNull();
    tournamentId = cup!.id;
    const shortId = cup!.short_id;
    expect(shortId, 'short_id generated by the DB default').toMatch(
      /^[0-9a-z]{8}$/,
    );

    const adminContext = await browser.newContext();
    const adminPage = await adminContext.newPage();

    await test.step('Spillere-rommet viser den delbare påmeldingslenken', async () => {
      await adminPage.goto('/login');
      await signInViaOtp(adminPage, ADMIN_EMAIL!);
      await adminPage.goto(`/admin/cup/${tournamentId}/spillere`);
      const field = adminPage.getByTestId('cup-share-link');
      await expect(field).toBeVisible({ timeout: 25_000 });
      // Absolutt URL som ender på spillerens dør.
      await expect(field).toHaveValue(
        new RegExp(`^https?://.+/cup/bli-med/${shortId}$`),
      );
    });

    const playerContext = await browser.newContext();
    const playerPage = await playerContext.newPage();

    await test.step('spilleren åpner lenken, logger inn og melder seg på', async () => {
      await playerPage.goto(`/cup/bli-med/${shortId}`);
      await expect(playerPage).toHaveURL(/\/login/, { timeout: 15_000 });
      await signInViaOtp(playerPage, PLAYER_EMAIL!);
      await playerPage.goto(`/cup/bli-med/${shortId}`);

      await expect(
        playerPage.getByTestId('cup-join-state-can_join'),
      ).toBeVisible({ timeout: 25_000 });
      await playerPage.getByTestId('cup-join-submit').click();
      await expect(
        playerPage.getByTestId('cup-join-state-already_joined'),
      ).toBeVisible({ timeout: 25_000 });
    });

    await test.step('SQL-orakel: deltakerraden finnes', async () => {
      const { data: rows } = await admin
        .from('tournament_participants')
        .select('user_id')
        .eq('tournament_id', tournamentId)
        .returns<{ user_id: string }[]>();
      expect(rows?.map((r) => r.user_id)).toContain(playerUser!.id);
    });

    await test.step('arrangøren ser spilleren i Spillere-rommet', async () => {
      await adminPage.goto(`/admin/cup/${tournamentId}/spillere`);
      await expect(
        adminPage.getByTestId(`cup-participants-remove-${playerUser!.id}`),
      ).toBeVisible({ timeout: 25_000 });
    });

    await test.step('spilleren melder seg av igjen', async () => {
      await playerPage.getByTestId('cup-join-leave').click();
      await expect(
        playerPage.getByTestId('cup-join-state-can_join'),
      ).toBeVisible({ timeout: 25_000 });

      const { data: rows } = await admin
        .from('tournament_participants')
        .select('user_id')
        .eq('tournament_id', tournamentId)
        .returns<{ user_id: string }[]>();
      expect(rows?.map((r) => r.user_id) ?? []).not.toContain(playerUser!.id);
    });
  });
});
