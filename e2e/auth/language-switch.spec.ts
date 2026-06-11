import { test, expect, chromium } from '@playwright/test';

/**
 * Language switcher smoke tests (issue #552 — i18n Fase 1).
 *
 * Verifies that the Norsk/English control on /login:
 *   1. Switches the page locale on click (URL, <html lang>, copy).
 *   2. Persists the choice across a full page reload (NEXT_LOCALE cookie).
 *   3. Negotiates the right locale from Accept-Language on fresh sessions.
 *
 * No Supabase service env needed — the login page is public and the
 * switcher works pre-auth.
 *
 * Note: all tests use an explicit `locale` context option so the
 * Accept-Language header is deterministic regardless of the CI runner's
 * system locale.
 */

test.describe('Language switcher (pre-auth on /login)', () => {
  test('golden path: switch to English, persists on reload, switch back to Norsk', async ({
    browser,
  }) => {
    // Fresh context with a Norwegian locale so Accept-Language → Norwegian
    // (no NEXT_LOCALE cookie) and we start from the known default.
    const ctx = await browser.newContext({ locale: 'nb-NO' });
    const page = await ctx.newPage();

    // 1. Norwegian is the default.
    await page.goto('/login');
    await expect(
      page.getByRole('button', { name: 'Send meg kode' }),
    ).toBeVisible();

    // 2. Switch to English.
    await page.getByTestId('locale-option-en').click();

    // URL must become /en/login (no /no/login, no prefix on default locale).
    await expect(page).toHaveURL('/en/login');

    // html lang attribute must flip.
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');

    // English copy must be visible.
    await expect(
      page.getByRole('button', { name: 'Send me a code' }),
    ).toBeVisible();

    // 3. Reload — English must persist (NEXT_LOCALE cookie).
    await page.reload();
    await expect(page).toHaveURL('/en/login');
    await expect(
      page.getByRole('button', { name: 'Send me a code' }),
    ).toBeVisible();

    // 4. Switch back to Norsk — must land on /login, NOT /no/login.
    await page.getByTestId('locale-option-no').click();

    await expect(page).toHaveURL('/login');
    // Norwegian copy is back.
    await expect(
      page.getByRole('button', { name: 'Send meg kode' }),
    ).toBeVisible();

    await ctx.close();
  });

  test('negotiation: en-GB Accept-Language → English on fresh session', async () => {
    // Create a completely fresh browser context with an English locale so
    // Playwright sets Accept-Language: en-GB (no NEXT_LOCALE cookie).
    const browser = await chromium.launch();
    const context = await browser.newContext({ locale: 'en-GB' });
    const page = await context.newPage();

    await page.goto('/login');

    // The proxy reads Accept-Language when no cookie exists → English.
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(
      page.getByRole('button', { name: 'Send me a code' }),
    ).toBeVisible();

    await context.close();
    await browser.close();
  });

  test('negotiation: nb-NO Accept-Language → Norwegian on fresh session', async () => {
    const browser = await chromium.launch();
    const context = await browser.newContext({ locale: 'nb-NO' });
    const page = await context.newPage();

    await page.goto('/login');

    await expect(page.locator('html')).toHaveAttribute('lang', 'no');
    await expect(
      page.getByRole('button', { name: 'Send meg kode' }),
    ).toBeVisible();

    await context.close();
    await browser.close();
  });
});
