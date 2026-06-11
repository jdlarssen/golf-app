import { test, expect } from '@playwright/test';

/**
 * Smoke-test av login-skjemaet (issue #107).
 *
 * Magic-link-flyten ble retired 2026-05-13 til fordel for OTP-kode (se
 * CLAUDE.md "Auth-flyt"). Denne speccen er nå redusert til en smoke:
 * den bekrefter at /login rendres med dagens to-stegs OTP-form
 * (e-post-input + "Send meg kode"-knapp), at gamle magic-link-rester
 * faktisk er borte, og at uautentiserte besøkende bouncer til /login.
 *
 * Den faktiske OTP-verifiseringsflyten (signInWithOtp → verifyOtp →
 * session-cookie → invitation.accepted_at) dekkes av
 * `e2e/auth/invitation-flow.spec.ts` (issue #30), så vi duplikerer ikke
 * den her — den krever service-role-env og er stor og treg. Denne
 * speccen skal kunne kjøre uten Supabase-tilgang.
 */
test.describe('Login form smoke (OTP step 1)', () => {
  test('rendres med e-post-input og "Send meg kode"-knapp', async ({ page }) => {
    await page.goto('/login');

    // BrandHero-wordmarket er sidas heading — «Logg inn»-h1-en ble fjernet
    // i db8b73e (BrandHero-swap), så den gamle asserten var stale.
    await expect(page.getByRole('heading', { name: 'Tørny' })).toBeVisible();
    await expect(page.getByLabel('E-post')).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Send meg kode' }),
    ).toBeVisible();

    // Magic-link-knappen skal være borte.
    await expect(
      page.getByRole('button', { name: 'Send meg lenke' }),
    ).toHaveCount(0);

    // Ingen passord-felt — auth er passord-løs.
    await expect(page.locator('input[type="password"]')).toHaveCount(0);
  });

  test('e-post-feltet er påkrevet (HTML5-validering blokkerer tom submit)', async ({
    page,
  }) => {
    await page.goto('/login');

    const emailInput = page.getByLabel('E-post');
    // `required`-attributtet sørger for at nettleseren stopper submit
    // før vi treffer server-action-en — så vi kan asserte det direkte
    // uten å være avhengig av Supabase-respons.
    await expect(emailInput).toHaveAttribute('required', '');
    await expect(emailInput).toHaveAttribute('type', 'email');
  });

  test('redirecter uautentisert besøkende til /login', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/login/);
  });

  // Selv-registreringsflagget (issue #166) er default av, så hjelpe-teksten
  // som inviterer nye besøkende til å lage konto skal IKKE være synlig på
  // standard /login. Toggle-på-staten verifiseres på komponent-nivå i
  // _components/SendCodeForm.test.tsx — Next.js inliner NEXT_PUBLIC_*-envs
  // ved build, så vi kan ikke flippe flagget per-Playwright-test uten å
  // bygge serveren på nytt.
  test('viser ikke selv-registreringshjelp når flagget er av (default)', async ({
    page,
  }) => {
    await page.goto('/login');
    await expect(
      page.getByText(
        'Skriv inn e-posten din. Er du ny her, lager vi en konto til deg.',
      ),
    ).toHaveCount(0);
  });
});
