import { test, expect } from '@playwright/test';

/**
 * Type D — porten foran Kavalkaden (#2129).
 *
 * Kavalkaden er personlige tall om spilleren og gjengen. Den skal aldri kunne
 * nås uten innlogging, uansett hvordan URL-en blir delt. Selve kortene
 * verifiseres på staging med `KAVALKADE_OPEN_AT` (kontrakten på #1040), for de
 * krever både en innlogget spiller med ferdige runder og en overstyrt
 * åpningsdato.
 */
test.describe('Kavalkaden (logged out)', () => {
  test('sends an anonymous visitor to the login page', async ({ page }) => {
    await page.goto('/kavalkade/2026');
    await expect(page).toHaveURL(/\/login/);
  });
});
