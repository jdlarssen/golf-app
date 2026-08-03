import { test, expect } from '@playwright/test';

/**
 * Pilarsiden «Arranger golfturnering» (#1267) — anonym golden path. Helt
 * offentlig og server-rendret, så speccen krever verken innlogging,
 * service-role-env eller Supabase-tilgang: den navigerer inn uinnlogget, ser
 * guiden (ingen bounce til /login), og følger CTA-en inn i demoen. Den andre
 * testen dekker hub-en sitt veivalg videre: målgruppe-kort → underside.
 *
 * Dekker samtidig at `AUTH_OPTIONAL_PATH_PATTERN` i proxy.ts faktisk slipper
 * stien gjennom — det er den eneste automatiske vakten på den regelen (samme
 * mønster som e2e/public/spillformater-status.spec.ts).
 *
 * Driver på data-testid/role — aldri norsk copy (test-disiplin Type D).
 */
test.describe('Pilarside: arranger golfturnering (public, no login)', () => {
  test('anonym side rendres og CTA-en fører til demoen @gate', async ({
    page,
  }) => {
    await page.goto('/arranger-golfturnering');

    // Auth-valgfri: en anonym besøkende gates ikke til /login.
    await expect(page).toHaveURL(/\/arranger-golfturnering$/);
    await expect(page.getByTestId('arrange-guide')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    // Format-velgeren lenker til /spillformater/<slug>.
    await expect(
      page.getByTestId('arrange-guide-format-card').first(),
    ).toBeVisible();

    // Slutt-CTA → inn i den spillbare demoen.
    await page.getByTestId('arrange-guide-demo-cta').click();
    await expect(page).toHaveURL(/\/demo$/);
    await expect(page.getByTestId('demo-banner')).toBeVisible();
  });

  test('målgruppe-kortet fører fra hub til underside @gate', async ({
    page,
  }) => {
    await page.goto('/arranger-golfturnering');

    // Hub-en tilbyr målgruppe-kort; første kort tar oss til undersiden.
    const card = page.getByTestId('arrange-guide-audience-card').first();
    await expect(card).toBeVisible();
    await card.click();

    // Undersiden er en egen rute under hub-en, og slipper anonyme gjennom.
    await expect(page).toHaveURL(/\/arranger-golfturnering\/[a-z]+$/);
    await expect(page.getByTestId('arrange-guide-audience')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });
});
