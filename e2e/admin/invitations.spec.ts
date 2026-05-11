import { test, expect } from '@playwright/test';

test.describe('Admin invitations page (logged-out behaviour)', () => {
  test('redirects to login when not authenticated', async ({ page }) => {
    await page.goto('/admin/invitations');
    await expect(page).toHaveURL(/\/login/);
  });
});
