import { test, expect } from '@playwright/test';
import {
  PLAYER_EMAIL,
  adminClient,
  cleanupTestGame,
  envReady,
  seedActiveStablefordGame,
  signInViaOtp,
  skipReason,
} from '../_helpers/games';

/**
 * Et skjema som sender deg videre, ligger ikke lenger bak deg (#2746,
 * `docs/user-flows.md` §Tilbake punkt 7). Type D: i en server-handling legger
 * Next sin egen `redirect` en ny side i historikken, og det ser bare en ekte
 * nettleser. Rader ryddes bare i CI.
 */
test.describe('et sendt skjema i historikken', () => {
  test.skip(!envReady, skipReason);

  const gameIds: string[] = [];
  test.afterAll(async () => {
    if (!process.env.CI) return;
    for (const id of gameIds) await cleanupTestGame(id);
  });

  test('lever kort: nettleserens tilbake gir ikke skjemaet @gate', async ({ page }) => {
    const game = await seedActiveStablefordGame('form-history');
    gameIds.push(game.id);
    const { error } = await adminClient()
      .from('scores')
      .upsert(
        Array.from({ length: 18 }, (_, i) => ({
          game_id: game.id,
          user_id: game.playerUserId,
          hole_number: i + 1,
          strokes: 4,
          entered_by: game.playerUserId,
          client_updated_at: new Date().toISOString(),
        })),
      );
    expect(error).toBeNull();

    await signInViaOtp(page, PLAYER_EMAIL!);
    await page.goto(`/games/${game.id}`);
    await page.goto(`/games/${game.id}/submit`);
    const [response] = await Promise.all([
      page.waitForResponse((r) => Boolean(r.headers()['x-action-redirect']), { timeout: 60_000 }),
      page.locator('button[type=submit]:visible').first().click(),
    ]);
    expect(response.headers()['x-action-redirect']).toMatch(/;replace$/);
    await expect(page).toHaveURL(new RegExp(`/games/${game.id}\\?`), { timeout: 60_000 });

    await page.goBack({ waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(new RegExp(`/games/${game.id}$`), { timeout: 30_000 });
  });
});
