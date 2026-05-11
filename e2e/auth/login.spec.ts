import { test, expect } from '@playwright/test';

test.describe('Login flow', () => {
  test('shows the login form', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: 'Logg inn' })).toBeVisible();
    await expect(page.getByLabel('E-post')).toBeVisible();
    await expect(page.getByLabel('Passord')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Logg inn' })).toBeVisible();
  });

  test('shows error on invalid credentials', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('E-post').fill('nonexistent@example.com');
    await page.getByLabel('Passord').fill('wrong-password');
    await page.getByRole('button', { name: 'Logg inn' }).click();
    await expect(page.getByText('Feil e-post eller passord.')).toBeVisible();
  });

  test('redirects unauthenticated visitor to /login', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/login/);
  });
});
