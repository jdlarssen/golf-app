import { test, expect } from '@playwright/test';
import {
  envReady,
  skipReason,
  adminClient,
  PLAYER_EMAIL,
  signInViaOtp,
  logEgressFailures,
  seedActiveStablefordGame,
  cleanupTestGame,
  type ActiveGame,
} from '../_helpers/games';

/**
 * Regression guard for #1895: a withdrawn player keeps read access to their own
 * scorecard on the web, the way the app has always shown it.
 *
 * This is the ONLY automated proof of that behaviour — `scorecard/page.tsx` has
 * no unit test, and the redirect it used to do was a server-side `redirect()`
 * that only a real request can exercise. Without this spec, re-adding the bounce
 * would pass every unit-level gate. It runs in the @lifecycle lane (staging),
 * not on every PR, so it is a regression net, not a merge gate.
 *
 * The second assertion keeps #387 locked from the other side: seeing the frozen
 * card must not reopen the delivery path — `/submit` still bounces a withdrawn
 * player to game-home.
 *
 * Assertions are on URL + `data-testid`, never on Norwegian copy (test
 * discipline D). Env-gated to staging via `_helpers/games`; never touches prod.
 * Tagged @lifecycle (seeds a game and logs in — well past the @gate budget).
 */
test.describe('Scorecard for a withdrawn player @lifecycle', () => {
  test.skip(!envReady, skipReason);
  test.slow();

  let game: ActiveGame | null = null;

  test.beforeAll(async () => {
    game = await seedActiveStablefordGame('scorecard-withdrawn');
    // Withdraw the seeded player (service-role). This runs BEFORE any page of
    // the game is rendered, so the `game-${id}` tag cache never holds a
    // pre-withdrawal snapshot — the service-role write bypasses revalidateTag,
    // and a render before it would make the redirect-removal look broken.
    // The row count is asserted:
    // PostgREST returns `error == null` for an UPDATE that matched nothing, so
    // a silent 0-row withdraw would leave an ACTIVE player and make the test
    // below vacuously green (AGENTS.md trap 2).
    const admin = adminClient();
    const { data: rows, error } = await admin
      .from('game_players')
      .update({ withdrawn_at: new Date().toISOString() })
      .eq('game_id', game.id)
      .eq('user_id', game.playerUserId)
      .select('user_id');
    if (error) throw new Error(`service-role withdraw failed: ${error.message}`);
    if ((rows ?? []).length !== 1) {
      throw new Error(
        `withdraw should affect exactly 1 row, got ${(rows ?? []).length}`,
      );
    }
  });

  test.afterAll(async () => {
    if (game) await cleanupTestGame(game.id);
  });

  test('withdrawn player sees their own card; submit stays closed', async ({
    page,
  }) => {
    const gameId = game!.id;
    logEgressFailures(page);

    await page.goto(`/login?next=/games/${gameId}/scorecard`);
    await signInViaOtp(page, PLAYER_EMAIL!);

    await test.step('scorecard renders instead of bouncing to game-home', async () => {
      await page.goto(`/games/${gameId}/scorecard`);
      await expect(page).toHaveURL(/\/scorecard$/, { timeout: 15_000 });
      await expect(
        page.getByTestId('scorecard-withdrawn-notice'),
      ).toBeVisible({ timeout: 15_000 });
    });

    await test.step('the only CTA leads back to the game, never into hole entry', async () => {
      // The hole page is read-only for a withdrawn player, so a «tilbake til
      // hull N» link would be a dead end. Structural assertions on hrefs, no
      // copy: no link into /holes/, and a link back to the game exists.
      await expect(page.locator('a[href*="/holes/"]')).toHaveCount(0);
      await expect(
        page.locator(`a[href$="/games/${gameId}"]`).first(),
      ).toBeVisible();
    });

    await test.step('submit still redirects away (#387)', async () => {
      await page.goto(`/games/${gameId}/submit`);
      await expect(page).not.toHaveURL(/\/submit$/, { timeout: 15_000 });
    });
  });
});
