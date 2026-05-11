import { test, expect } from '@playwright/test';

test.describe('Leaderboard (logged-out)', () => {
  test('redirects to login', async ({ page }) => {
    await page.goto('/games/00000000-0000-0000-0000-000000000000/leaderboard');
    await expect(page).toHaveURL(/\/login/);
  });

  test('redirects to login from hole-by-hole', async ({ page }) => {
    await page.goto(
      '/games/00000000-0000-0000-0000-000000000000/leaderboard/holes',
    );
    await expect(page).toHaveURL(/\/login/);
  });
});
