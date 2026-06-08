import { test, expect } from '@playwright/test';

// Lightweight auth-gate-tester for solo-stableford-relaterte ruter (gjelder
// både stableford og modified_stableford). Speiler mønsteret fra
// solo-strokeplay.spec.ts / nassau.spec.ts. Stableford-spesifikk scoring-
// korrekthet (poeng-tabell + per-hull-eksponering, standard + modifisert)
// dekkes av Type A scoring-cases + Type C render-test. Flyt-en verifiseres i
// prod av admin.

test.describe('Stableford-runde ruter (logged-out)', () => {
  test('hull-side på stableford redirecter til login', async ({ page }) => {
    await page.goto('/games/00000000-0000-0000-0000-000000000000/holes/1');
    await expect(page).toHaveURL(/\/login/);
  });

  test('leaderboard på stableford redirecter til login', async ({ page }) => {
    await page.goto(
      '/games/00000000-0000-0000-0000-000000000000/leaderboard',
    );
    await expect(page).toHaveURL(/\/login/);
  });

  test('hull-for-hull på stableford redirecter til login', async ({ page }) => {
    await page.goto(
      '/games/00000000-0000-0000-0000-000000000000/leaderboard/holes',
    );
    await expect(page).toHaveURL(/\/login/);
  });
});
