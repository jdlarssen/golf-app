import { routing, type AppLocale } from '@/i18n/routing';

/**
 * The address prefix is the language (#2292). `localePrefix: 'as-needed'`
 * serves non-default locales under `/<locale>` and the default locale bare, so
 * `/en` and `/en/…` are English and everything else is the default.
 *
 * For pages that render outside the `[locale]` segment and so never see the
 * locale param — `app/global-not-found.tsx`. A prefix must be followed by `/`
 * or the end of the path: `/entry` is not English.
 */
export function localeFromPathname(pathname: string): AppLocale {
  for (const locale of routing.locales) {
    if (pathname === `/${locale}` || pathname.startsWith(`/${locale}/`)) {
      return locale;
    }
  }
  return routing.defaultLocale;
}

/**
 * Inline script that sets `<html lang>` from `location.pathname` before first
 * paint, mirroring `localeFromPathname` (the test runs both on the same paths).
 * A static page can't know the language on the server, so the browser picks
 * it; `pathLocaleVariantCss` then hides the variants that don't apply.
 * Must sit first in `<body>` without async/defer, like `themeBootstrapScript`.
 */
export function pathLocaleBootstrapScript(): string {
  const locales = JSON.stringify(routing.locales);
  const fallback = JSON.stringify(routing.defaultLocale);
  return `(function(){try{var p=location.pathname,l=${fallback},ls=${locales};for(var i=0;i<ls.length;i++){var c=ls[i];if(p==='/'+c||p.indexOf('/'+c+'/')===0){l=c;break;}}document.documentElement.lang=l;}catch(e){}})();`;
}

/**
 * One rule per locale: a `[data-locale-variant="X"]` block is hidden unless
 * `<html lang>` is X. Without the script the server's default `lang` stands, so
 * the default variant shows.
 */
export function pathLocaleVariantCss(): string {
  return routing.locales
    .map(
      (locale) =>
        `html:not([lang="${locale}"]) [data-locale-variant="${locale}"]{display:none}`,
    )
    .join('');
}
