import { test, expect } from '@playwright/test';

test('home page loads', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Hei, golf-app kommer snart!')).toBeVisible();
});
