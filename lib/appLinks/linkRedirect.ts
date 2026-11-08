import { NextResponse, type NextRequest } from 'next/server';
import { hasLocale } from 'next-intl';
import { routing } from '@/i18n/routing';
import { FROM_LINK_PARAM, FROM_LINK_VALUE, NO_APP_PARAM, NO_APP_VALUE } from './openInApp';

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

/**
 * The redirect for a link that reached its page: `fra=lenke` lets the page offer
 * «Åpne i appen», and `uten-app` comes along when the button brought the visitor
 * back without the app opening (`./openInApp.ts`).
 */
export function linkLandingRedirect(
  request: NextRequest,
  rawLocale: string,
  path: string,
  query: URLSearchParams = new URLSearchParams(),
): NextResponse {
  if (request.nextUrl.searchParams.get(NO_APP_PARAM) === NO_APP_VALUE) query.set(NO_APP_PARAM, NO_APP_VALUE);
  query.set(FROM_LINK_PARAM, FROM_LINK_VALUE);
  return linkRedirect(request, rawLocale, `${path}?${query.toString()}`);
}
