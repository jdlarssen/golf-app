import { test, expect } from '@playwright/test';

// Lightweight auth-gate-tester for skins-relaterte ruter. Speiler mønsteret
// fra wolf.spec.ts / nassau.spec.ts / hole.spec.ts / leaderboard.spec.ts.
// Skins-spesifikk carryover-scoring (pendant hull, multi-tied, uvunne skins
// ved delt siste hull, gross vs net) dekkes av Type A scoring-cases i
// lib/scoring/modes/skins.test.ts. Selve flyt-en verifiseres i prod av admin.

test.describe('Skins-runde ruter (logged-out)', () => {
  test('hull-side på skins-spill redirecter til login', async ({ page }) => {
    await page.goto('/games/00000000-0000-0000-0000-000000000000/holes/1');
    await expect(page).toHaveURL(/\/login/);
  });

  test('leaderboard på skins-spill redirecter til login', async ({ page }) => {
    await page.goto(
      '/games/00000000-0000-0000-0000-000000000000/leaderboard',
    );
    await expect(page).toHaveURL(/\/login/);
  });
});
