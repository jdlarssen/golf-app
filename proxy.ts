// Next.js 16 renamed the `middleware` convention to `proxy` (see
// node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md).
// We use the new convention. The function MUST be named `proxy`.
import { NextRequest, NextResponse } from 'next/server';
import createIntlMiddleware from 'next-intl/middleware';
import { routing } from '@/i18n/routing';
import { resolveLocale } from '@/lib/i18n/resolveLocale';
import { createMiddlewareClient } from '@/lib/supabase/middleware';
import { OFF_APP_THRESHOLD_MS } from '@/lib/notifications/thresholds';

// Handles locale detection, the as-needed rewrite (/x -> /no/x internally)
// and /en/... prefix routing. Runs for EVERY page — public ones included —
// because without the rewrite no unprefixed URL resolves to app/[locale]/.
const handleI18nRouting = createIntlMiddleware(routing);

const LOCALE_COOKIE = 'NEXT_LOCALE';

// Pages reachable while logged out. Checked against the locale-stripped
// pathname (so /en/login is public too). These USED to be matcher
// exclusions; they moved into code when the matcher had to start matching
// all pages for the i18n rewrite.
const PUBLIC_PATH_PATTERN =
  /^\/(login|register)$|^\/(legal|signup)(\/|$)/;

/** Split '/en/venner' -> { locale: 'en', pathname: '/venner' }. */
function splitLocalePrefix(pathname: string): {
  locale: string | null;
  pathname: string;
} {
  for (const locale of routing.locales) {
    if (pathname === `/${locale}`) return { locale, pathname: '/' };
    if (pathname.startsWith(`/${locale}/`)) {
      return { locale, pathname: pathname.slice(locale.length + 1) };
    }
  }
  return { locale: null, pathname };
}

export async function proxy(request: NextRequest) {
  const { locale: pathLocale, pathname: barePathname } = splitLocalePrefix(
    request.nextUrl.pathname,
  );

  // Public pages: no session work (same as the old matcher exclusions),
  // locale routing only. Strip any client-sent x-torny-user-id so the
  // verified-user header can never be spoofed on paths that skip getUser().
  if (PUBLIC_PATH_PATTERN.test(barePathname)) {
    request.headers.delete('x-torny-user-id');
    return handleI18nRouting(request);
  }

  const { supabase, response } = createMiddlewareClient(request);

  // Refresh session and read user. Cookies set during this call are mirrored
  // onto the request (for the route handler) and the helper's response —
  // copied onto the i18n response below.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const url = request.nextUrl.clone();
    const currentPath =
      request.nextUrl.pathname + (request.nextUrl.search || '');
    // Keep the visitor's locale through the login round-trip: /en/venner
    // redirects to /en/login?next=/en/venner (default locale stays
    // unprefixed, exactly like before).
    const prefix =
      pathLocale && pathLocale !== routing.defaultLocale
        ? `/${pathLocale}`
        : '';
    url.pathname = `${prefix}/login`;
    url.search = `?next=${encodeURIComponent(currentPath)}`;
    return NextResponse.redirect(url);
  }

  // Locale negotiation (#475): users.locale -> NEXT_LOCALE cookie ->
  // Accept-Language -> 'no'. The DB read runs only when the device has no
  // locale cookie (≈ first visit), then the resolved locale is persisted to
  // the cookie so steady-state requests cost zero extra round-trips. Known
  // trade-off (documented in contract): a device with an existing cookie
  // won't pick up a users.locale change made on ANOTHER device until its
  // cookie is refreshed — the Profil toggle (Phase 1) updates both DB and
  // cookie, which keeps same-device behavior exact.
  const cookieLocale = request.cookies.get(LOCALE_COOKIE)?.value ?? null;
  let resolvedLocale: string | null = null;
  if (!cookieLocale) {
    const { data: userRow } = await supabase
      .from('users')
      .select('locale')
      .eq('id', user.id)
      .single();
    resolvedLocale = resolveLocale({
      userLocale: userRow?.locale,
      acceptLanguage: request.headers.get('accept-language'),
    });
    // Feed our resolution into next-intl's detection (cookie has top
    // non-URL priority there) so both layers agree on the locale.
    request.cookies.set(LOCALE_COOKIE, resolvedLocale);
  }

  // Forward verified user id to the route handler so server components don't
  // need to call auth.getUser() again. Saves a Supabase Auth round-trip per
  // request (~80 ms) — adds up across the layout + page + Suspense bodies.
  // Set directly on the request so the i18n rewrite response forwards it.
  request.headers.set('x-torny-user-id', user.id);

  // Best-effort last_seen_at update — one round-trip, debounced via the
  // WHERE clause så Postgres no-ops når last_seen_at er ferskere enn
  // OFF_APP_THRESHOLD_MS. Holder skriv-frekvensen lav (én UPDATE per
  // bruker per terskel-vindu) samtidig som mail-gating-en i notify.ts
  // bruker SAMME terskel — uten match kan en aktiv bruker få mail fordi
  // siste last_seen_at-skriving er eldre enn off-app-vinduet.
  // Fire-and-forget så det aldri blokkerer responsen.
  void (async () => {
    try {
      await supabase
        .from('users')
        .update({ last_seen_at: new Date().toISOString() })
        .eq('id', user.id)
        .or(
          `last_seen_at.is.null,last_seen_at.lt.${new Date(Date.now() - OFF_APP_THRESHOLD_MS).toISOString()}`,
        );
    } catch {
      // Intentionally swallowed — never block the request.
    }
  })();

  // Locale routing LAST so the rewrite carries the mutated request
  // (x-torny-user-id header + refreshed session cookies) downstream.
  const intlResponse = handleI18nRouting(request);

  // Merge session cookies refreshed during getUser() onto the response the
  // browser actually receives.
  for (const cookie of response().cookies.getAll()) {
    intlResponse.cookies.set(cookie);
  }
  // Persist first-visit negotiation so the DB lookup doesn't repeat.
  if (resolvedLocale && !intlResponse.cookies.get(LOCALE_COOKIE)) {
    intlResponse.cookies.set(LOCALE_COOKIE, resolvedLocale, {
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
      sameSite: 'lax',
    });
  }

  return intlResponse;
}

export const config = {
  // Match every route EXCEPT:
  //   - _next/static, _next/image (build output / image optimizer)
  //   - api/* (handled by their own auth, if any)
  //   - PWA assets (must be reachable while logged out so the browser can
  //     evaluate them for install): sw.js, manifest.webmanifest, icon,
  //     icon0, apple-icon
  //   - favicon.ico, *.svg/png/jpg/jpeg/gif/webp/ico (static assets)
  // Public PAGES (login/register/legal/signup) are no longer excluded here:
  // they need the i18n rewrite to resolve at all, so the proxy matches them
  // and skips auth in code via PUBLIC_PATH_PATTERN instead.
  matcher: [
    '/((?!_next/static|_next/image|api/|sw\\.js|manifest\\.webmanifest|icon|icon0|apple-icon|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
