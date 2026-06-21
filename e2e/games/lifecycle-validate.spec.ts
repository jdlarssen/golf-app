import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import {
  envReady,
  skipReason,
  adminClient,
  ADMIN_EMAIL,
  PLAYER_EMAIL,
  signInViaOtp,
  seedFinishedModeGame,
  cleanupTestGame,
} from '../_helpers/games';

/**
 * Per-modus finish-and-validate (#736, del C).
 *
 * De grunne modus-spec-ene (`nassau.spec.ts` m.fl.) asserter bare «utlogget →
 * redirect». INGEN modus kjørte hele veien til en rendret leaderboard med
 * VALIDERTE tall, så en aggregerings-/render-regresjon (jf. #683/#707) ville
 * passert grønt. Denne seeder et FERDIG spill med en kjent, skjev score-matrise
 * per modus og asserter at leaderboard-DOM matcher et UAVHENGIG hardkodet orakel
 * — ikke et snapshot, og ikke lib/scoring-tall (som ville maskert en regresjon
 * ved å regne «forventet» med samme buggy kode).
 *
 * Orakel-triks: vinner (A=admin) og taper (B=spiller) får LIK course_handicap,
 * så netto-sammenligning reduseres til brutto-sammenligning og blir uavhengig av
 * banens stroke-index. A spiller alltid lavere enn B, så A vinner uansett bane.
 *
 * Env-gardet (staging), serial så de fire modusene deler én admin-innlogging.
 */
test.describe('Per-mode finish-and-validate (#736)', () => {
  test.describe.configure({ mode: 'serial' });
  test.skip(!envReady, skipReason);

  let ctx: BrowserContext;
  let page: Page;
  let adminId = '';
  let playerId = '';
  let adminName = '';
  const gameIds: string[] = [];

  const HCP = 18; // equal handicaps → net comparison == gross comparison

  test.beforeAll(async ({ browser }) => {
    const admin = adminClient();
    const a = await admin
      .from('users')
      .select('id, name, nickname')
      .ilike('email', ADMIN_EMAIL!)
      .maybeSingle<{ id: string; name: string | null; nickname: string | null }>();
    const p = await admin
      .from('users')
      .select('id, name, nickname')
      .ilike('email', PLAYER_EMAIL!)
      .maybeSingle<{ id: string; name: string | null; nickname: string | null }>();
    if (!a.data || !p.data) throw new Error('admin/player test users not seeded');
    adminId = a.data.id;
    playerId = p.data.id;
    adminName = (a.data.nickname?.trim() || a.data.name?.trim()) ?? '';
    // Resolved once so the per-mode winner-identity assertions are unconditional
    // (an empty name would otherwise silently skip the "A is the winner" check).
    expect(adminName, 'admin display name resolved').toBeTruthy();

    ctx = await browser.newContext();
    page = await ctx.newPage();
    await page.goto('/login?next=/');
    await signInViaOtp(page, ADMIN_EMAIL!);
  });

  test.afterAll(async () => {
    for (const id of gameIds) await cleanupTestGame(id);
    await ctx?.close();
  });

  // Helper: build a {hole: {userId: strokes}} matrix where A & B shoot a fixed
  // value each on holes 1..n.
  function flatMatrix(
    n: number,
    aStrokes: number,
    bStrokes: number,
  ): Record<number, Record<string, number>> {
    const m: Record<number, Record<string, number>> = {};
    for (let h = 1; h <= n; h++) m[h] = { [adminId]: aStrokes, [playerId]: bStrokes };
    return m;
  }

  test('solo_strokeplay: lower gross wins, net = gross − handicap @gate', async () => {
    test.slow();
    // A shoots 3 on all 18 → gross 54, net 36. B shoots 5 → gross 90, net 72.
    const { id } = await seedFinishedModeGame({
      nameSuffix: 'strokeplay',
      gameMode: 'solo_strokeplay',
      modeConfig: { kind: 'solo_strokeplay', team_size: 1 },
      players: [
        { userId: adminId, courseHandicap: HCP },
        { userId: playerId, courseHandicap: HCP },
      ],
      scoresByHole: flatMatrix(18, 3, 5),
    });
    gameIds.push(id);

    await page.goto(`/games/${id}/leaderboard`);
    await expect(page.getByText('Noe gikk galt')).toHaveCount(0);

    // 2-player strokeplay → head-to-head duel view (the 2-player leaderboard).
    const duel = page.getByTestId('head-to-head');
    await expect(duel).toBeVisible();
    // Oracle: A gross 54 (18 × 3, independent), net 36 (54 − 18); B net 72. The
    // verdict names A as the winner with the net duel score "36–72" — assert
    // BOTH net scores so a wrong aggregate can't coincidentally match.
    await expect(duel).toContainText('54');
    const verdict = duel.getByTestId('h2h-verdict');
    await expect(verdict).toContainText(adminName);
    await expect(verdict).toContainText('36');
    await expect(verdict).toContainText('72');
  });

  test('singles_matchplay: A wins all 10 played holes → decided 10&8 @gate', async () => {
    test.slow();
    // A wins every played hole (gross 3 vs 5; equal hcp ⇒ net also wins). 10
    // holes played, 8 remaining, 10-up ⇒ mat-em "10&8".
    const { id } = await seedFinishedModeGame({
      nameSuffix: 'matchplay',
      gameMode: 'singles_matchplay',
      modeConfig: { kind: 'singles_matchplay', team_size: 1, teams_count: 2 },
      players: [
        { userId: adminId, courseHandicap: HCP, teamNumber: 1 },
        { userId: playerId, courseHandicap: HCP, teamNumber: 2 },
      ],
      scoresByHole: flatMatrix(10, 3, 5),
    });
    gameIds.push(id);

    await page.goto(`/games/${id}/leaderboard`);
    await expect(page.getByText('Noe gikk galt')).toHaveCount(0);

    const banner = page.getByTestId('matchplay-status-banner');
    await expect(banner).toBeVisible();
    // Oracle: decided result string is "10&8" (marginUp & remainingAtDecision).
    await expect(banner).toContainText('10&8');
    await expect(banner.getByText(adminName).first()).toBeVisible();
  });

  test('skins: ties carry over, A sweeps the rest → 6 skins / 4 holes @gate', async () => {
    test.slow();
    // holes 1,2 tie (A=B=4) → 2 skins carry. hole 3 A wins (3 vs 5) → 3 skins.
    // holes 4,5,6 A wins each → +3 skins. Total A = 6 skins over 4 holes won.
    const m: Record<number, Record<string, number>> = {
      1: { [adminId]: 4, [playerId]: 4 },
      2: { [adminId]: 4, [playerId]: 4 },
      3: { [adminId]: 3, [playerId]: 5 },
      4: { [adminId]: 3, [playerId]: 5 },
      5: { [adminId]: 3, [playerId]: 5 },
      6: { [adminId]: 3, [playerId]: 5 },
    };
    const { id } = await seedFinishedModeGame({
      nameSuffix: 'skins',
      gameMode: 'skins',
      modeConfig: { kind: 'skins', skins_scoring: 'net' },
      players: [
        { userId: adminId, courseHandicap: HCP },
        { userId: playerId, courseHandicap: HCP },
      ],
      scoresByHole: m,
    });
    gameIds.push(id);

    await page.goto(`/games/${id}/leaderboard`);
    await expect(page.getByText('Noe gikk galt')).toHaveCount(0);

    // 2-player skins → head-to-head duel. Oracle: A 6 skins, B 0 → verdict "6–0".
    const duel = page.getByTestId('head-to-head');
    await expect(duel).toBeVisible();
    const verdict = duel.getByTestId('h2h-verdict');
    await expect(verdict).toContainText(adminName);
    await expect(verdict).toContainText('6');
    await expect(verdict).toContainText('0');
  });

  test('nassau: A wins front + back + total → sweeps @gate', async () => {
    test.slow();
    // A beats B on every hole (3 vs 5; equal hcp). Wins front (1–9), back
    // (10–18) and total ⇒ A is the nassau sweeper.
    const { id } = await seedFinishedModeGame({
      nameSuffix: 'nassau',
      gameMode: 'nassau',
      modeConfig: { kind: 'nassau', nassau_scoring: 'net' },
      players: [
        { userId: adminId, courseHandicap: HCP },
        { userId: playerId, courseHandicap: HCP },
      ],
      scoresByHole: flatMatrix(18, 3, 5),
    });
    gameIds.push(id);

    await page.goto(`/games/${id}/leaderboard`);
    await expect(page.getByText('Noe gikk galt')).toHaveCount(0);

    // 2-player nassau → head-to-head duel. Oracle: A wins all 3 segments
    // (front + back + total), so units = 3 (a sweep) and B = 0 → verdict "3–0".
    // The duel score is the nassau unit count (formats/nassau.tsx: score = units),
    // so asserting 3 & 0 catches a units-aggregation regression that still names A.
    const duel = page.getByTestId('head-to-head');
    await expect(duel).toBeVisible();
    const verdict = duel.getByTestId('h2h-verdict');
    await expect(verdict).toContainText(adminName);
    await expect(verdict).toContainText('3');
    await expect(verdict).toContainText('0');
  });
});
