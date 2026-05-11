import { test, expect } from '@playwright/test';

test.describe('Submit scorecard (logged-out)', () => {
  test('redirects to login when not authenticated', async ({ page }) => {
    await page.goto(
      '/games/00000000-0000-0000-0000-000000000000/submit',
    );
    await expect(page).toHaveURL(/\/login/);
  });
});
