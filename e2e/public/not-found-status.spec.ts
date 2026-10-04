import { test, expect } from '@playwright/test';
import {
  envReady,
  PLAYER_EMAIL,
  signInViaOtp,
  skipReason,
} from '../_helpers/games';

/**
 * Unknown addresses get Tørny's branded 404, not Next's built-in English page
 * (#2292, the gap #612 left open).
 *
 * `app/[locale]/not-found.tsx` only renders for `notFound()` thrown by a page
 * under `[locale]`. An address no route matches never reaches it — that is
 * `app/global-not-found.tsx`'s job. Each anonymous case takes a different path
 * through `proxy()`: a public prefix (`/legal/…`), the `/en` prefix, an
 * auth-optional prefix (`/hvorfor-torny/…`) and the spillformat slug guard,
 * which lets multi-segment paths through. The signed-in case covers the auth
 * branch.
 *
 * The page is static and picks its language in the browser from the address
 * prefix, so the checks are on `lang` and the visible `[data-locale-variant]`,
 * never on Norwegian copy.
 *
 * @gate on the anonymous cases: fast and stateless.
 */
const ANONYMOUS_CASES = [
  { path: '/legal/finnes-ikke-xyz', lang: 'no' },
  { path: '/en/legal/finnes-ikke-xyz', lang: 'en' },
  { path: '/hvorfor-torny/x', lang: 'no' },
  { path: '/spillformater/a/b', lang: 'no' },
] as const;

test.describe('ukjent adresse: merket 404 (public, no login)', () => {
  for (const { path, lang } of ANONYMOUS_CASES) {
    test(`${path} svarer 404 med merket side på «${lang}» @gate`, async ({
      page,
    }) => {
      const response = await page.goto(path);
      expect(response?.status()).toBe(404);

      await expect(page.getByTestId('not-found')).toBeVisible();
      await expect(page.getByTestId('not-found')).toHaveCount(1);

      await expect(page.locator('html')).toHaveAttribute('lang', lang);

      const visibleVariant = page.locator('[data-locale-variant]:visible');
      await expect(visibleVariant).toHaveCount(1);
      await expect(visibleVariant).toHaveAttribute('data-locale-variant', lang);

      // The home button must leave the 404 for real. A client-side navigation
      // out of this page changed the URL but kept the 404 on screen, because
      // the page owns <html>/<body> outside the [locale] layout.
      const home = lang === 'en' ? '/en' : '/';
      await visibleVariant.getByRole('link').click();
      await expect
        .poll(() => new URL(page.url()).pathname)
        .toBe(home);
      await expect(page.getByTestId('not-found')).toHaveCount(0);
    });
  }
});

test.describe('ukjent adresse: merket 404 (innlogget)', () => {
  test.skip(!envReady, `E2E-env mangler: ${skipReason}`);

  test('/venner svarer 404 med merket side', async ({ page }) => {
    await signInViaOtp(page, PLAYER_EMAIL!);

    const response = await page.goto('/venner');
    expect(response?.status()).toBe(404);
    await expect(page.getByTestId('not-found')).toBeVisible();
  });
});
