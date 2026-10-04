import { afterEach, describe, expect, it } from 'vitest';
import { routing } from '@/i18n/routing';
import {
  localeFromPathname,
  pathLocaleBootstrapScript,
  pathLocaleVariantCss,
} from './pathLocale';

const CASES = [
  ['/', 'no'],
  ['/en', 'en'],
  ['/en/', 'en'],
  ['/en/legal/x', 'en'],
  ['/entry', 'no'],
  ['/legal/en', 'no'],
  ['/no/x', 'no'],
] as const;

afterEach(() => {
  window.history.replaceState(null, '', '/');
  document.documentElement.removeAttribute('lang');
});

describe('localeFromPathname', () => {
  it.each(CASES)('%s → %s', (pathname, expected) => {
    expect(localeFromPathname(pathname)).toBe(expected);
  });
});

describe('pathLocaleBootstrapScript (runs before first paint)', () => {
  // Run the inline script the way the browser does, against the current
  // location. The script and localeFromPathname must agree on every path.
  it.each(CASES)('sets <html lang> on %s like localeFromPathname', (pathname) => {
    window.history.replaceState(null, '', pathname);
    new Function(pathLocaleBootstrapScript())();
    expect(document.documentElement.lang).toBe(localeFromPathname(pathname));
  });
});

describe('pathLocaleVariantCss', () => {
  it('hides each locale variant unless <html lang> is that locale', () => {
    const css = pathLocaleVariantCss();
    const rules = css.split('}').filter(Boolean);
    expect(rules).toHaveLength(routing.locales.length);
    for (const locale of routing.locales) {
      expect(css).toContain(
        `html:not([lang="${locale}"]) [data-locale-variant="${locale}"]{display:none}`,
      );
    }
  });
});
