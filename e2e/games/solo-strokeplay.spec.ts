import { test, expect } from '@playwright/test';

// Lightweight auth-gate-tester for solo-strokeplay-relaterte ruter. Speiler
// mønsteret fra nassau.spec.ts / wolf.spec.ts. Solo-strokeplay-spesifikk
// scoring-korrekthet (netto-ranking + per-hull-eksponering) dekkes av Type A
// scoring-cases + Type C render-test for view/podium/holes. Selve flyt-en
// verifiseres i prod av admin.

test.describe('Slagspill-runde ruter (logged-out)', () => {
  test('hull-side på slagspill redirecter til login', async ({ page }) => {
    await page.goto('/games/00000000-0000-0000-0000-000000000000/holes/1');
    await expect(page).toHaveURL(/\/login/);
  });

  test('leaderboard på slagspill redirecter til login', async ({ page }) => {
    await page.goto(
      '/games/00000000-0000-0000-0000-000000000000/leaderboard',
    );
    await expect(page).toHaveURL(/\/login/);
  });

  test('hull-for-hull på slagspill redirecter til login', async ({ page }) => {
    await page.goto(
      '/games/00000000-0000-0000-0000-000000000000/leaderboard/holes',
    );
    await expect(page).toHaveURL(/\/login/);
  });
});
