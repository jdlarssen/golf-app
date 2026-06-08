import { test, expect } from '@playwright/test';

// Lightweight auth-gate-tester for bingo-bango-bongo-relaterte ruter. Speiler
// mønsteret fra acey-deucey.spec.ts / nines.spec.ts. BBB-spesifikk in-runde-
// flyt (prestasjons-poeng bingo/bango/bongo per hull) dekkes av Type A
// scoring-tester + Type C render-tester for view/podium/holes.
// Selve flyt-en verifiseres i prod av admin.

test.describe('Bingo Bango Bongo-runde ruter (logged-out)', () => {
  test('hull-side på bbb-spill redirecter til login', async ({ page }) => {
    await page.goto('/games/00000000-0000-0000-0000-000000000000/holes/1');
    await expect(page).toHaveURL(/\/login/);
  });

  test('leaderboard på bbb-spill redirecter til login', async ({ page }) => {
    await page.goto(
      '/games/00000000-0000-0000-0000-000000000000/leaderboard',
    );
    await expect(page).toHaveURL(/\/login/);
  });

  // «Hull for hull» (#496 PR 6): den format-bevisste per-hull-flaten for
  // Bingo Bango Bongo. Selve visningen dekkes av Type C render-test
  // (BingoBangoBongoHolesView); her sikrer vi bare auth-gaten på ruta.
  test('hull-for-hull på bbb-spill redirecter til login', async ({ page }) => {
    await page.goto(
      '/games/00000000-0000-0000-0000-000000000000/leaderboard/holes',
    );
    await expect(page).toHaveURL(/\/login/);
  });
});
