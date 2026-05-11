import { test, expect } from '@playwright/test';

test.describe('Admin courses page (logged-out)', () => {
  test('redirects to login when not authenticated', async ({ page }) => {
    await page.goto('/admin/courses');
    await expect(page).toHaveURL(/\/login/);
  });

  test('redirects to login for new-course page when not authenticated', async ({ page }) => {
    await page.goto('/admin/courses/new');
    await expect(page).toHaveURL(/\/login/);
  });
});
