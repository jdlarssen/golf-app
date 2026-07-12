import { test, expect } from '@playwright/test';

/**
 * Anonym «Finn turneringer» (#1185) — golden path for den uinnloggede gaten.
 * Uinnloggede bounces ikke lenger til /login: de får en anonym visning av
 * åpne turneringer med en login-CTA. Driver på data-testid/role — aldri norsk
 * copy (test-disiplin Type D).
 *
 * DB-uavhengig med vilje: asserter kun at ruta IKKE redirecter og at
 * anon-visningen + login-CTA-en er til stede. Både tom og fylt tilstand
 * rendrer wrapper + CTA, så testen er stabil uansett hva basen inneholder.
 */
test.describe('Anon finn turneringer (public, no login)', () => {
  test('uinnlogget besøk viser anon-lista i stedet for login-redirect', async ({
    page,
  }) => {
    await page.goto('/finn-turneringer');

    // Offentlig rute (#1185 proxy-whitelist): ingen bounce til /login.
    await expect(page).toHaveURL(/\/finn-turneringer$/);

    // Anon-visningen rendret (wrapperen finnes i både tom og fylt tilstand).
    await expect(page.getByTestId('anon-finn-turneringer')).toBeVisible();

    // Login-CTA til stede og peker inn i login-flyten med next-param.
    const loginCta = page.getByTestId('anon-login-cta');
    await expect(loginCta).toBeVisible();
    await expect(loginCta).toHaveAttribute('href', /\/login\?next=/);
  });
});
