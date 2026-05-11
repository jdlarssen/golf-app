import { test, expect } from '@playwright/test';

test.describe('Admin games page (logged-out)', () => {
  test('redirects to login when not authenticated', async ({ page }) => {
    await page.goto('/admin/games');
    await expect(page).toHaveURL(/\/login/);
  });

  test('redirects to login for new-game page', async ({ page }) => {
    await page.goto('/admin/games/new');
    await expect(page).toHaveURL(/\/login/);
  });
});
