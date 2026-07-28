import { test, expect } from '@playwright/test';

/**
 * Type D-røyktest for den globale tastaturfokus-indikatoren (#1386).
 *
 * Poenget er å teste den ÉNE tingen kildekoden ikke kan bevise: at regelen
 * faktisk vinner i nettleseren. Lag-rekkefølge slår spesifisitet i Tailwind v4,
 * så havner `:focus-visible`-regelen inne i en `@layer`, taper den mot
 * `focus:outline-none`-utilitiene og `outlineStyle` blir stående på `'none'` —
 * med en diff som ser helt riktig ut. Derfor asserteres computed style, ikke CSS.
 *
 * Målet er LocaleSwitcher på den anonyme forsiden: offentlig (ingen innlogging,
 * ingen service-role-env), og wrapperen har `overflow-hidden` + `data-focus-inset`,
 * så den dekker både den globale regelen og inset-unntaket i én test.
 *
 * Fokus flyttes med ekte Tab-trykk — `:focus-visible` skal per definisjon IKKE
 * fyre på peker-input, så et programmatisk `.focus()` ville testet feil ting.
 *
 * Driver på data-testid, aldri norsk copy (test-disiplin Type D).
 */
test.describe('Tastaturfokus (public, no login)', () => {
  test('Tab gir en synlig outline på segmentert kontroll', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('anon-landing')).toBeVisible();

    // Tab-er innover til fokus lander på et locale-segment. Taket er en vakt
    // mot uendelig løkke hvis topp-raden en gang skulle endre rekkefølge.
    const focusedTestId = () =>
      page.evaluate(
        () => document.activeElement?.getAttribute('data-testid') ?? '',
      );

    let landed = '';
    for (let i = 0; i < 12 && !landed; i++) {
      await page.keyboard.press('Tab');
      const id = await focusedTestId();
      if (id.startsWith('locale-option-')) landed = id;
    }
    expect(landed, 'Tab nådde aldri et locale-segment').not.toBe('');

    const outline = await page.getByTestId(landed).evaluate((el) => {
      const s = getComputedStyle(el);
      return { style: s.outlineStyle, width: s.outlineWidth };
    });

    expect(outline.style).not.toBe('none');
    expect(parseFloat(outline.width)).toBeGreaterThanOrEqual(2);
  });
});
