import { test, expect } from '@playwright/test';

test.describe('Admin spillere page (logged-out behaviour)', () => {
  test('redirects to login when not authenticated', async ({ page }) => {
    await page.goto('/admin/spillere');
    await expect(page).toHaveURL(/\/login/);
  });
});
