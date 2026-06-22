import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import {
  envReady,
  skipReason,
  ADMIN_EMAIL,
  fetchOtpForEmail,
  signInViaOtpWith,
} from '../_helpers/games';

/**
 * Deterministisk gjenopprettings-bevis for #861.
 *
 * Bakgrunn: hver `generateLink`-mint regenererer brukerens ene engangs-token og
 * ugyldiggjør den forrige. Når to innlogginger på samme e-post flettes, kan et
 * tidligere `verifyOtp` lande på en token en senere mint allerede har supersedet
 * → `/login?...&error=code_expired`. `signInViaOtp` (#861) absorberer dette med
 * mint-fersk-og-retry.
 *
 * Denne spec-en gjør sannsynlighets-flaket DETERMINISTISK: vi injiserer en mint
 * som på FØRSTE forsøk minter OTP_A, så umiddelbart minter OTP_B (som superseder
 * A), og returnerer den nå-foreldede A. Det tvinger fram nøyaktig `code_expired`
 * på forsøk 1. Forsøk 2 minter ferskt. Vi kjører den EKTE produksjons-stien
 * (`signInViaOtpWith` — samme attempt/navigerings-logikk som `signInViaOtp`) og
 * asserter at innloggingen likevel lykkes, OG at det krevde ≥2 mints (dvs. retry-
 * løkka faktisk fyrte — den fyrer kun på en retryable feil).
 *
 * Env-gardet (staging) på samme måte som de andre fullflyts-specene; hopper over
 * uten service-role-nøkkel + admin-bruker. Tagget `@lifecycle` (ikke `@gate`) —
 * dette er et infrastruktur-bevis, ikke en kjerne-flyt-røyktest.
 */
test.describe('OTP retry recovery (#861)', () => {
  test.skip(!envReady, skipReason);

  let ctx: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    ctx = await browser.newContext();
    page = await ctx.newPage();
  });

  test.afterAll(async () => {
    await ctx?.close();
  });

  test('signInViaOtp recovers from a forced code_expired on attempt 1 @lifecycle', async () => {
    let mintCalls = 0;

    // Forgiftet mint: forsøk 1 returnerer en supersedet (utløpt) token; senere
    // forsøk returnerer en fersk, gyldig OTP.
    const poisonMint = async (): Promise<string> => {
      mintCalls += 1;
      if (mintCalls === 1) {
        const stale = await fetchOtpForEmail(ADMIN_EMAIL!);
        // Andre mint på samme bruker REGENERERER token-en → `stale` er nå ugyldig.
        const fresh = await fetchOtpForEmail(ADMIN_EMAIL!);
        // Sanity: tokenene skal være forskjellige, ellers er `stale` fortsatt gyldig
        // og racen blir ikke utøvd (gjør den degenererte tilstanden synlig, ikke
        // stille-passerende).
        expect(stale, 'andre mint regenererte token-en').not.toBe(fresh);
        return stale;
      }
      return fetchOtpForEmail(ADMIN_EMAIL!);
    };

    await page.goto('/login?next=/');
    // Den EKTE produksjons-retry-stien, kun med injisert mint.
    await signInViaOtpWith(page, ADMIN_EMAIL!, poisonMint);

    // Beviset: vi forlot /login (autentisert) TROSS en tvunget code_expired på
    // forsøk 1, og retry-løkka fyrte (≥2 mints; den fyrer kun på en retryable feil).
    await expect(page).not.toHaveURL(/\/login\b/);
    expect(mintCalls, 'retry fyrte etter forsøk-1 code_expired').toBeGreaterThanOrEqual(2);
  });
});
