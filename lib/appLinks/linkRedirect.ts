import { NextResponse, type NextRequest } from 'next/server';
import { hasLocale } from 'next-intl';
import { routing } from '@/i18n/routing';

/**
 * The real 307 behind the paths that exist so a link can open the app (#2748):
 * without the app, the browser lands on the page itself, in the link's locale.
 *
 * A route handler and not a page's `redirect()`: `app/[locale]/loading.tsx` could
 * turn that into a streamed 200, and a link preview in Messenger needs to follow a
 * real redirect to the page with the `og:` fields.
 */
export function linkRedirect(request: NextRequest, rawLocale: string, pathAndQuery: string): NextResponse {
  const prefix = !hasLocale(routing.locales, rawLocale) || rawLocale === routing.defaultLocale ? '' : `/${rawLocale}`;
  return NextResponse.redirect(new URL(`${prefix}${pathAndQuery}`, request.nextUrl.origin), 307);
}
