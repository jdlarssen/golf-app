import { test, expect } from '@playwright/test';

test.describe('Magic link login', () => {
  test('shows the magic link form', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: 'Logg inn' })).toBeVisible();
    await expect(page.getByLabel('E-post')).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Send meg lenke' }),
    ).toBeVisible();
    // Password field is gone
    await expect(page.locator('input[type="password"]')).toHaveCount(0);
  });

  test('shows success or user-not-found after submitting an email', async ({
    page,
  }) => {
    await page.goto('/login');
    await page.getByLabel('E-post').fill('nonexistent@example.com');
    await page.getByRole('button', { name: 'Send meg lenke' }).click();
    // Supabase's behaviour with shouldCreateUser=false for an unknown email
    // depends on project config: it may silently succeed (don't leak whether
    // an email is registered) OR return an error. Either outcome proves the
    // form submitted correctly.
    await expect(
      page.locator(
        'text=/Sjekk e-posten din|Denne mailen er ikke registrert/',
      ),
    ).toBeVisible({ timeout: 10_000 });
  });

  test('redirects unauthenticated visitor to /login', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/login/);
  });
});
