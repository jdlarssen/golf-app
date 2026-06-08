import { test, expect } from '@playwright/test';

// Lightweight auth-gate-tester for acey-deucey-relaterte ruter. Speiler
// mønsteret fra round-robin.spec.ts / nines.spec.ts. Acey-Deucey-spesifikk
// in-runde-flyt (4 spillere, ace +3 / deuce −3 per hull) dekkes av Type A
// scoring-tester + Type C render-tester for view/podium/holes.
// Selve flyt-en verifiseres i prod av admin.

test.describe('Acey-Deucey-runde ruter (logged-out)', () => {
  test('hull-side på acey-deucey-spill redirecter til login', async ({ page }) => {
    await page.goto('/games/00000000-0000-0000-0000-000000000000/holes/1');
    await expect(page).toHaveURL(/\/login/);
  });

  test('leaderboard på acey-deucey-spill redirecter til login', async ({ page }) => {
    await page.goto(
      '/games/00000000-0000-0000-0000-000000000000/leaderboard',
    );
    await expect(page).toHaveURL(/\/login/);
  });

  // «Hull for hull» (#496 PR 5): den format-bevisste per-hull-flaten for
  // Acey-Deucey. Selve visningen dekkes av Type C render-test
  // (AceyDeuceyHolesView); her sikrer vi bare auth-gaten på ruta.
  test('hull-for-hull på acey-deucey-spill redirecter til login', async ({ page }) => {
    await page.goto(
      '/games/00000000-0000-0000-0000-000000000000/leaderboard/holes',
    );
    await expect(page).toHaveURL(/\/login/);
  });
});
