import { test, expect } from '@playwright/test';

test.describe('Hole screen (logged-out)', () => {
  test('redirects to login when not authenticated', async ({ page }) => {
    await page.goto('/games/00000000-0000-0000-0000-000000000000/holes/1');
    await expect(page).toHaveURL(/\/login/);
  });

  test('redirects to login for game home', async ({ page }) => {
    await page.goto('/games/00000000-0000-0000-0000-000000000000');
    await expect(page).toHaveURL(/\/login/);
  });

  test('redirects to login for scorecard', async ({ page }) => {
    await page.goto(
      '/games/00000000-0000-0000-0000-000000000000/scorecard',
    );
    await expect(page).toHaveURL(/\/login/);
  });
});
