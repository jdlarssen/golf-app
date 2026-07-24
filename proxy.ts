// Next.js 16 renamed the `middleware` convention to `proxy` (see
// node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md).
// We use the new convention. The function MUST be named `proxy`.
import { NextRequest, NextResponse } from 'next/server';
import createIntlMiddleware from 'next-intl/middleware';
import { routing } from '@/i18n/routing';
import { resolveLocale } from '@/lib/i18n/resolveLocale';
import { createMiddlewareClient } from '@/lib/supabase/middleware';
import { OFF_APP_THRESHOLD_MS } from '@/lib/notifications/thresholds';
import { MODE_LABELS } from '@/lib/scoring/modes/types';

// Handles locale detection, the as-needed rewrite (/x -> /no/x internally)
// and /en/... prefix routing. Runs for EVERY page — public ones included —
// because without the rewrite no unprefixed URL resolves to app/[locale]/.
const handleI18nRouting = createIntlMiddleware(routing);

const LOCALE_COOKIE = 'NEXT_LOCALE';

// Pages reachable while logged out. Checked against the locale-stripped
// pathname (so /en/login is public too). These USED to be matcher
// exclusions; they moved into code when the matcher had to start matching
// all pages for the i18n rewrite. `opengraph-image` (#1264) is the root
// OG-image route (app/[locale]/opengraph-image.tsx) — served extensionless,
// so the matcher's asset exclusions miss it, and social scrapers fetch it
// anonymously.
const PUBLIC_PATH_PATTERN =
  /^\/(login|register)$|^\/(legal|signup|spectate|baner|embed|demo|opengraph-image)(\/|$)/;

// #1185: auth-optional routes. The proxy STILL resolves the user here (so a
// logged-in visitor keeps their verified-user header — and thus their
// personalized page and the persistent bottom nav), but an anonymous visitor
// is NOT redirected to /login: the page renders an anonymous view instead.
// Distinct from PUBLIC_PATH_PATTERN, which skips auth entirely (for
// externally-shared or chromeless pages like /signup and /embed).
// `spillformater` joined in #1264 (SEO-pakken): anonymous visitors (and
// crawlers) render the format guide without a login redirect, while
// logged-in visitors keep their verified-user header — and thus the
// persistent bottom nav (#355). PUBLIC would strip the header and cost
// logged-in users the nav (the exact trap #1185 documented).
// Bare root `/` joined in #1265 (offentlig forside): an anonymous visitor
// renders the marketing landing (app/[locale]/AnonLanding.tsx) instead of a
// login redirect, while a logged-in visitor keeps their personalized home +
// bottom nav. `splitLocalePrefix` maps both `/` and `/en` to '/', so the one
// `^\/$` alternation covers both locales. PUBLIC is tested first and never
// matches `/`, so there is no collision.
const AUTH_OPTIONAL_PATH_PATTERN =
  /^\/$|^\/(finn-turneringer|spillformater)(\/|$)/;

// #1286: gyldige spillformat-detalj-slugs = MODE_LABELS-nøklene. SAMME kilde
// som detaljsiden (`app/[locale]/spillformater/[slug]/page.tsx:17`), så guarden
// og siden aldri driver ut av synk — en ny GameMode blir gyldig begge steder
// samtidig (trap 4: én hjemme-regel). MODE_LABELS er en ren TS-konstant uten
// klient-avhengigheter, trygg å importere i proxy-konteksten.
const VALID_SPILLFORMAT_SLUGS = new Set<string>(Object.keys(MODE_LABELS));

// Matcher NØYAKTIG /spillformater/<slug> (ett segment, ingen trailing slash,
// ingen nesting): `[^/]+` krever minst ett ikke-slash-tegn og `$` anker, så
// liste-siden /spillformater og /spillformater/ (tom slug) faller utenfor og
// røres ikke. Kjøres på locale-strippet sti, så /en/spillformater/… dekkes.
const SPILLFORMAT_SLUG_PATTERN = /^\/spillformater\/([^/]+)$/;

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

/**
 * #1286: minimal, brandet 404-respons for ukjente spillformat-slugs. Svares
 * direkte fra proxyen (ikke rewrite til not-found.tsx): under `cacheComponents`
 * ville en rewrite re-streame den statiske 200-shellen og statuskoden kunne
 * ikke lenger settes til 404 (docs: «it is not possible to change the status
 * code after streaming started»). En egen minimal side har ingen app-shell/nav
 * — bevisst: den lekker ingen innlogget chrome og trenger ingen auth-kontekst
 * (crawlere er hovedpublikum). `Cache-Control: no-store` så en slug som senere
 * blir en gyldig GameMode ikke sitter fast som cachet 404.
 */
function spillformatNotFoundResponse(): NextResponse {
  const html = `<!doctype html>
<html lang="nb">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Fant ikke spillformen · Tørny</title>
<style>
:root{color-scheme:light dark}
body{margin:0;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1rem;padding:2rem;text-align:center;background:#F8F6F0;color:#1B4332;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
h1{margin:0;font-size:1.5rem;font-weight:600}
p{margin:0;max-width:22rem;color:#4b5a52;line-height:1.5}
a{display:inline-block;margin-top:.5rem;padding:.65rem 1.25rem;border-radius:9999px;background:#1B4332;color:#F8F6F0;text-decoration:none;font-weight:500}
@media(prefers-color-scheme:dark){body{background:#12211a;color:#F8F6F0}p{color:#b7c4bc}a{background:#C9A961;color:#12211a}}
</style>
</head>
<body>
<h1>Fant ikke denne spillformen</h1>
<p>Spillformen finnes ikke. Se hele oversikten over formatene Tørny støtter.</p>
<a href="/spillformater">Til spillformene</a>
</body>
</html>`;
  return new NextResponse(html, {
    status: 404,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

export async function proxy(request: NextRequest) {
  // Host canonicalization (#1277): www → apex with a 308. Done here in the
  // proxy — NOT as a Vercel-edge domain redirect — because the matcher below
  // excludes `.well-known/` and `api/`, so the proxy never runs for those
  // paths and www can serve them 200 directly (Apple's CDN and Google's
  // verifier don't follow redirects for the .well-known files; this also stops
  // www `api/cron/` URLs from being redirected away, #1304). Hardcoded host
  // compare, not env: Vercel previews (*.vercel.app) and localhost are
  // untouched. Requires flipping the www domain in the Vercel dashboard from
  // "Redirect to apex" to "serve production" so this rule owns the redirect.
  if (request.headers.get('host') === 'www.tornygolf.no') {
    const url = request.nextUrl.clone();
    url.protocol = 'https';
    url.hostname = 'tornygolf.no';
    url.port = ''; // never carry a port into the canonical apex URL
    return NextResponse.redirect(url, 308);
  }

  const { locale: pathLocale, pathname: barePathname } = splitLocalePrefix(
    request.nextUrl.pathname,
  );

  // #1286: ekte 404 for ugyldige spillformat-slugs. Under `cacheComponents`/PPR
  // sendes den statiske shellen (og dermed statuskoden 200) FØR den dynamiske
  // delen når `notFound()` — så sidens korrekte notFound()-kode kan ikke rette
  // statusen etter at streamingen er startet. Next-docs
  // (`loading.md:117`, `proxy.md` §Producing a response) anbefaler å avgjøre
  // 404 i proxyen: vi svarer 404 her, FØR auth-/i18n-grenene, så crawlere aldri
  // ser soft-404 for vilkårlige slugs under /spillformater/. Guarden ligger før
  // og uavhengig av auth-grenen, så AUTH_OPTIONAL-semantikken (anonym visning
  // av gyldige formater) er uendret.
  const spillformatSlug = SPILLFORMAT_SLUG_PATTERN.exec(barePathname)?.[1];
  if (spillformatSlug !== undefined && !VALID_SPILLFORMAT_SLUGS.has(spillformatSlug)) {
    return spillformatNotFoundResponse();
  }

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
    // #1185: auth-optional routes render an anonymous view instead of gating
    // to /login. Strip any client-sent header (same guard as the public
    // branch) and hand off to i18n routing; the page's null-user branch takes
    // over. All other routes still redirect to /login below.
    if (AUTH_OPTIONAL_PATH_PATTERN.test(barePathname)) {
      request.headers.delete('x-torny-user-id');
      return handleI18nRouting(request);
    }
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
  //
  // #640 item 6: this branch only runs for an authenticated user (the !user
  // guard above redirected anonymous visitors), so we pass signedIn: true.
  // That skips the Accept-Language step — a logged-in user with NULL
  // users.locale defaults to 'no' instead of inheriting an English-language
  // browser. Anonymous visitors hit public pages via handleI18nRouting (whose
  // own next-intl detection still honors Accept-Language), so they're
  // unaffected.
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
      signedIn: true,
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
  //   - sitemap.xml, robots.txt (#1023): root-level metadata routes
  //     (app/sitemap.ts, app/robots.ts) live OUTSIDE app/[locale]/, so the
  //     i18n rewrite would 404 them — and crawlers are anonymous, so the
  //     auth-gate would redirect them to /login. Excluded entirely.
  //   - .well-known (#1277): app/.well-known/* route handlers (assetlinks.json,
  //     apple-app-site-association) live OUTSIDE app/[locale]/ and are fetched
  //     anonymously by Google/Apple, which don't follow redirects — same reason
  //     as sitemap/robots. Excluding it here also keeps the www→apex
  //     canonicalization above from ever touching these paths.
  // Public PAGES (login/register/legal/signup/baner) are no longer excluded
  // here: they need the i18n rewrite to resolve at all, so the proxy matches
  // them and skips auth in code via PUBLIC_PATH_PATTERN instead.
  matcher: [
    '/((?!_next/static|_next/image|api/|sw\\.js|manifest\\.webmanifest|sitemap\\.xml|robots\\.txt|\\.well-known|icon|icon0|apple-icon|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
