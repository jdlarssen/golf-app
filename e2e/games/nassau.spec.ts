import { test, expect } from '@playwright/test';

// Lightweight auth-gate-tester for nassau-relaterte ruter. Speiler mønsteret
// fra wolf.spec.ts / hole.spec.ts / leaderboard.spec.ts. Nassau-spesifikk
// scoring-korrekthet (front 9 / back 9 / total 18 + push på tie + unit-
// aggregering) dekkes av 25 Type A scoring-cases + 12 validator-cases + Type
// C render-tester for view/podium. Selve flyt-en verifiseres i prod av admin.

test.describe('Nassau-runde ruter (logged-out)', () => {
  test('hull-side på nassau-spill redirecter til login', async ({ page }) => {
    await page.goto('/games/00000000-0000-0000-0000-000000000000/holes/1');
    await expect(page).toHaveURL(/\/login/);
  });

  test('leaderboard på nassau-spill redirecter til login', async ({ page }) => {
    await page.goto(
      '/games/00000000-0000-0000-0000-000000000000/leaderboard',
    );
    await expect(page).toHaveURL(/\/login/);
  });
});
