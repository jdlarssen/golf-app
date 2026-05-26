// Next.js 16 renamed the `middleware` convention to `proxy` (see
// node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md).
// We use the new convention. The function MUST be named `proxy`.
import { NextRequest, NextResponse } from 'next/server';
import { createMiddlewareClient } from '@/lib/supabase/middleware';
import { OFF_APP_THRESHOLD_MS } from '@/lib/notifications/thresholds';

export async function proxy(request: NextRequest) {
  const { supabase, response, setRequestHeader } = createMiddlewareClient(request);

  // Refresh session and read user. Cookies set during this call are forwarded
  // via the response builder.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const url = request.nextUrl.clone();
    const currentPath =
      request.nextUrl.pathname + (request.nextUrl.search || '');
    url.pathname = '/login';
    url.search = `?next=${encodeURIComponent(currentPath)}`;
    return NextResponse.redirect(url);
  }

  // Forward verified user id to the route handler so server components don't
  // need to call auth.getUser() again. Saves a Supabase Auth round-trip per
  // request (~80 ms) — adds up across the layout + page + Suspense bodies.
  setRequestHeader('x-torny-user-id', user.id);

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

  return response();
}

export const config = {
  // Match every route EXCEPT:
  //   - _next/static, _next/image (build output / image optimizer)
  //   - api/* (handled by their own auth, if any)
  //   - login, register (must be reachable while logged out)
  //   - legal/* (privacy/terms — public, invitees must be able to read
  //     them before logging in)
  //   - signup/* (public landing page for self-registration; the page
  //     itself redirects unauthed visitors to /login with the correct
  //     ?next= back-link, so the proxy must let them through)
  //   - PWA assets (must be reachable while logged out so the browser can
  //     evaluate them for install): sw.js, manifest.webmanifest, icon,
  //     icon0, apple-icon
  //   - favicon.ico, *.svg/png/jpg/jpeg/gif/webp/ico (static assets)
  matcher: [
    '/((?!_next/static|_next/image|api/|login|register|legal/|signup/|sw\\.js|manifest\\.webmanifest|icon|icon0|apple-icon|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
