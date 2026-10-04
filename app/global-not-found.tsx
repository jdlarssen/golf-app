import type { Metadata, Viewport } from 'next';
import { createTranslator } from 'next-intl';
import './globals.css';
import { fraunces, inter, rootIcons, rootViewport } from './rootShell';
import { AppShell } from '@/components/ui/AppShell';
import { NotFoundView } from '@/components/NotFoundView';
import { routing, type AppLocale } from '@/i18n/routing';
import { loadMessages } from '@/lib/i18n/messages';
import {
  pathLocaleBootstrapScript,
  pathLocaleVariantCss,
} from '@/lib/i18n/pathLocale';
import { canonicalPath } from '@/lib/seo/canonical';
import { themeBootstrapScript } from '@/lib/theme/themePreference';

/**
 * #2292: the branded 404 for addresses no route matches (`/legal/x`,
 * `/en/venner`, …). Without it Next served its own English page.
 * `app/[locale]/not-found.tsx` only covers `notFound()` from pages under
 * `[locale]`; this file renders outside that layout (experimental
 * `globalNotFound` flag in next.config.ts), so it brings its own document,
 * styles, fonts and viewport.
 *
 * It is static: no request reads (headers, cookies, root params), which under
 * cacheComponents would make a prerendered page dynamic. So the server can't
 * know the language. It renders every locale's text and lets the browser pick
 * from the address prefix before first paint (`lib/i18n/pathLocale.ts`).
 *
 * No bottom nav and no version footer: both need the NextIntl provider that
 * lives in the `[locale]` layout. The button takes a signed-in player home,
 * with a full page load (`hardNavigation`).
 */

export const viewport: Viewport = rootViewport;

async function notFoundTranslator(locale: AppLocale) {
  return createTranslator({
    locale,
    messages: await loadMessages(locale),
    namespace: 'notFound',
    timeZone: 'Europe/Oslo',
  });
}

// The tab title is always the default locale's: the page is static and the
// server doesn't know the language (the page body switches, the title not).
// Next adds `<meta name="robots" content="noindex">` to 404 responses itself.
export async function generateMetadata(): Promise<Metadata> {
  const t = await notFoundTranslator(routing.defaultLocale);
  return { title: `${t('heading')} – Tørny`, icons: rootIcons };
}

export default async function GlobalNotFound() {
  const variants = await Promise.all(
    routing.locales.map(async (locale) => ({
      locale,
      t: await notFoundTranslator(locale),
    })),
  );

  return (
    <html
      lang={routing.defaultLocale}
      // The bootstraps below set `data-theme` and `lang` on <html> before
      // hydration; this keeps React from flagging those attributes.
      suppressHydrationWarning
      className={`${inter.variable} ${fraunces.variable} h-full`}
    >
      <body className="min-h-full flex flex-col font-sans">
        {/* Before first paint, so render-blocking (no async/defer): the saved
            Lys/Mørk choice (#991), then the language from the address. */}
        <script dangerouslySetInnerHTML={{ __html: themeBootstrapScript() }} />
        <script
          dangerouslySetInnerHTML={{ __html: pathLocaleBootstrapScript() }}
        />
        <style dangerouslySetInnerHTML={{ __html: pathLocaleVariantCss() }} />
        <AppShell showVersion={false}>
          <div data-testid="not-found">
            {variants.map(({ locale, t }) => (
              <div key={locale} data-locale-variant={locale} lang={locale}>
                <NotFoundView
                  heading={t('heading')}
                  body={t('body')}
                  buttonLabel={t('button')}
                  homeHref={canonicalPath(locale, '/')}
                  hardNavigation
                />
              </div>
            ))}
          </div>
        </AppShell>
      </body>
    </html>
  );
}
