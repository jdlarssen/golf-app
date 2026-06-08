import { test, expect } from '@playwright/test';

// Lightweight auth-gate-tester for nines-relaterte ruter. Speiler mønsteret
// fra wolf.spec.ts / hole.spec.ts / leaderboard.spec.ts. Nines-spesifikk
// in-runde-flyt (3 spillere, poeng-per-plassering, leaderboard-totals)
// dekkes av Type A scoring-tester + Type C render-tester for view/podium.
// Selve flyt-en verifiseres i prod av admin.

test.describe('Nines-runde ruter (logged-out)', () => {
  test('hull-side på nines-spill redirecter til login', async ({ page }) => {
    await page.goto('/games/00000000-0000-0000-0000-000000000000/holes/1');
    await expect(page).toHaveURL(/\/login/);
  });

  test('leaderboard på nines-spill redirecter til login', async ({ page }) => {
    await page.goto(
      '/games/00000000-0000-0000-0000-000000000000/leaderboard',
    );
    await expect(page).toHaveURL(/\/login/);
  });

  // «Hull for hull» (#496 PR 3): den format-bevisste per-hull-flaten for Nines.
  // Selve visningen dekkes av Type C render-test (NinesHolesView); her sikrer
  // vi bare auth-gaten på ruta.
  test('hull-for-hull på nines-spill redirecter til login', async ({ page }) => {
    await page.goto(
      '/games/00000000-0000-0000-0000-000000000000/leaderboard/holes',
    );
    await expect(page).toHaveURL(/\/login/);
  });
});
