import { test, expect } from '@playwright/test';
import { tapParOnRail } from '../_helpers/scoreRail';

/**
 * Prøvespill-demoen (#1042, ny hullside #2281) — golden path. Helt offentlig og
 * klient-side, så denne speccen krever verken innlogging, service-role-env
 * eller Supabase-tilgang: den navigerer inn uinnlogget, taster par på skinna,
 * ser at stripa med tavla endrer seg, og følger «Hopp over demoen» inn i
 * innloggingen. Driver på data-testid/role/aria — aldri norsk copy (test-
 * disiplin Type D).
 */
test.describe('Prøvespill demo (public, no login)', () => {
  test('uinnlogget besøker kan taste på skinna og nå innloggingen', async ({ page }) => {
    await page.goto('/demo');

    // Offentlig: ingen bounce til /login.
    await expect(page).toHaveURL(/\/demo$/);
    const strip = page.getByTestId('demo-standing');
    await expect(strip).toBeVisible();

    // Par på skinna for «Deg» → stripa skal endre seg.
    const before = await strip.getAttribute('aria-label');
    await tapParOnRail(page);
    await expect(strip).not.toHaveAttribute('aria-label', before ?? '');

    // #1391: det globale sync-banneret gates på proxy-verifisert innlogging, og
    // /demo er en offentlig rute der proxyen stripper den headeren. Ingenting
    // skal derfor ha rørt Dexie her — basen er lazy-open, så eksisterer den,
    // har banneret (eller noe annet) rendret på en flate uten innlogging.
    const dbNames = await page.evaluate(async () =>
      (await indexedDB.databases()).map((db) => db.name),
    );
    expect(dbNames).not.toContain('golf-app');

    // «Hopp over demoen …» → inn i innloggingen.
    await page.getByTestId('demo-skip').click();
    await expect(page).toHaveURL(/\/login\?next=%2F$/);
  });

  test('demoen er lenket fra login-siden', async ({ page }) => {
    await page.goto('/login');
    await page.getByTestId('try-demo-link').click();
    await expect(page).toHaveURL(/\/demo$/);
  });
});
