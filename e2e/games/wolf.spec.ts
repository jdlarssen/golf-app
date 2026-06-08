import { test, expect } from '@playwright/test';

// Lightweight auth-gate-tester for wolf-relaterte ruter. Speiler mønsteret
// fra hole.spec.ts / leaderboard.spec.ts / submit.spec.ts. Wolf-spesifikk
// in-runde-flyt (4 spillere, partner/lone/blind, leaderboard-totals)
// dekkes av Type A scoring-tester (52 cases) + Type C render-tester for
// modal/view/podium. Selve flyt-en verifiseres i prod av admin.

test.describe('Wolf-runde ruter (logged-out)', () => {
  test('hull-side på wolf-spill redirecter til login', async ({ page }) => {
    await page.goto('/games/00000000-0000-0000-0000-000000000000/holes/1');
    await expect(page).toHaveURL(/\/login/);
  });

  test('leaderboard på wolf-spill redirecter til login', async ({ page }) => {
    await page.goto(
      '/games/00000000-0000-0000-0000-000000000000/leaderboard',
    );
    await expect(page).toHaveURL(/\/login/);
  });

  // «Hull for hull» (#496 PR 2): den format-bevisste per-hull-flaten for Wolf.
  // Selve visningen dekkes av Type C render-test (WolfHolesView); her sikrer
  // vi bare auth-gaten på ruta.
  test('hull-for-hull på wolf-spill redirecter til login', async ({ page }) => {
    await page.goto(
      '/games/00000000-0000-0000-0000-000000000000/leaderboard/holes',
    );
    await expect(page).toHaveURL(/\/login/);
  });
});
