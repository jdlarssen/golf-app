import { test, expect } from '@playwright/test';

/**
 * Prøvespill-demoen (#1042) — golden path. Helt offentlig og klient-side, så
 * denne speccen krever verken innlogging, service-role-env eller Supabase-
 * tilgang: den navigerer inn uinnlogget, taster ett slag, ser at tavla
 * re-ranker, og følger «Klar for ekte runde?» inn i registreringen. Driver på
 * data-testid/role/aria — aldri norsk copy (test-disiplin Type D).
 */
test.describe('Prøvespill demo (public, no login)', () => {
  test('uinnlogget besøker kan spille og nå registreringen', async ({ page }) => {
    await page.goto('/demo');

    // Offentlig: ingen bounce til /login.
    await expect(page).toHaveURL(/\/demo$/);
    await expect(page.getByTestId('demo-banner')).toBeVisible();

    const board = page.getByTestId('stableford-leaderboard');
    await expect(board).toBeVisible();

    // Tast et slag for «Deg» via +1-stepperen → tavla skal endre seg.
    const before = await board.innerText();
    await page.getByRole('button', { name: '+1' }).first().click();
    await expect(async () => {
      expect(await board.innerText()).not.toBe(before);
    }).toPass();

    // «Klar for ekte runde?» → inn i registreringen.
    await page.getByTestId('demo-cta').getByRole('link').click();
    await expect(page).toHaveURL(/\/login/);
  });

  test('demoen er lenket fra login-siden', async ({ page }) => {
    await page.goto('/login');
    await page.getByTestId('try-demo-link').click();
    await expect(page).toHaveURL(/\/demo$/);
  });
});
