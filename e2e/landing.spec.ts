import { test, expect } from '@playwright/test';

/**
 * Offentlig forside (#1265) — anonym golden path. Fullstendig offentlig og
 * server-rendret, så denne speccen krever verken innlogging, service-role-env
 * eller Supabase-tilgang: den navigerer inn uinnlogget mot `/`, ser den
 * anonyme landingen (ingen bounce til /login), og følger hero-CTA-en inn i
 * demoen. Driver på data-testid/role — aldri norsk copy (test-disiplin Type D).
 */
test.describe('Offentlig forside (public, no login)', () => {
  test('anonym / viser landingen og hero-CTA fører til demoen @gate', async ({
    page,
  }) => {
    await page.goto('/');

    // Auth-valgfri: en anonym besøkende gates ikke til /login.
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByTestId('anon-landing')).toBeVisible();

    // Hero-CTA «Prøv Tørny …» → inn i den spillbare demoen.
    await page.getByTestId('anon-demo-cta').click();
    await expect(page).toHaveURL(/\/demo$/);
    await expect(page.getByTestId('demo-banner')).toBeVisible();
  });
});
