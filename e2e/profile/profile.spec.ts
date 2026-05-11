import { test, expect } from '@playwright/test';

test.describe('Complete profile page (logged-out)', () => {
  test('redirects to login when not authenticated', async ({ page }) => {
    await page.goto('/complete-profile');
    await expect(page).toHaveURL(/\/login/);
  });
});
