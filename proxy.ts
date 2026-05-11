// Next.js 16 renamed the `middleware` convention to `proxy` (see
// node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md).
// We use the new convention. The function MUST be named `proxy`.
import { NextRequest, NextResponse } from 'next/server';
import { createMiddlewareClient } from '@/lib/supabase/middleware';

export async function proxy(request: NextRequest) {
  const { supabase, response } = createMiddlewareClient(request);

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

  return response();
}

export const config = {
  // Match every route EXCEPT:
  //   - _next/static, _next/image (build output / image optimizer)
  //   - api/* (handled by their own auth, if any)
  //   - login, register (must be reachable while logged out)
  //   - auth/callback (magic-link exchange — MUST run without a session)
  //   - PWA assets (must be reachable while logged out so the browser can
  //     evaluate them for install): sw.js, manifest.webmanifest, icon,
  //     icon0, apple-icon
  //   - favicon.ico, *.svg/png/jpg/jpeg/gif/webp/ico (static assets)
  matcher: [
    '/((?!_next/static|_next/image|api/|login|register|auth/callback|sw\\.js|manifest\\.webmanifest|icon|icon0|apple-icon|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
