import { test, expect } from '@playwright/test';

// Lightweight auth-gate-tester for round-robin-relaterte ruter. Speiler
// mønsteret fra nines.spec.ts / wolf.spec.ts. Round Robin-spesifikk
// in-runde-flyt (4 spillere, 3 roterende segmenter, hull-seire) dekkes av
// Type A scoring-tester + Type C render-tester for view/podium.
// Selve flyt-en verifiseres i prod av admin.

test.describe('Round Robin-runde ruter (logged-out)', () => {
  test('hull-side på round-robin-spill redirecter til login', async ({ page }) => {
    await page.goto('/games/00000000-0000-0000-0000-000000000000/holes/1');
    await expect(page).toHaveURL(/\/login/);
  });

  test('leaderboard på round-robin-spill redirecter til login', async ({ page }) => {
    await page.goto(
      '/games/00000000-0000-0000-0000-000000000000/leaderboard',
    );
    await expect(page).toHaveURL(/\/login/);
  });

  // «Hull for hull» (#496 PR 4): den format-bevisste, segment-grupperte
  // per-hull-flaten for Round Robin. Selve visningen dekkes av Type C
  // render-test (RoundRobinHolesView); her sikrer vi bare auth-gaten på ruta.
  test('hull-for-hull på round-robin-spill redirecter til login', async ({ page }) => {
    await page.goto(
      '/games/00000000-0000-0000-0000-000000000000/leaderboard/holes',
    );
    await expect(page).toHaveURL(/\/login/);
  });
});
