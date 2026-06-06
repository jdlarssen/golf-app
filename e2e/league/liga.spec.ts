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
