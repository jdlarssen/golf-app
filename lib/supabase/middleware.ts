import { createServerClient } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';

/**
 * Build a Supabase server client bound to a NextRequest/NextResponse pair
 * so cookies set by Supabase (session refresh) propagate to both the
 * upstream request handler and the downstream client.
 *
 * Returns the response and client; callers should:
 *   1. Run their auth logic with the returned client.
 *   2. Return the returned response (mutated with any session cookies).
 *
 * Pattern follows the Supabase Next.js SSR docs.
 */
export function createMiddlewareClient(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);

  function buildResponse() {
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  let response = buildResponse();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (toSet) => {
          // Mirror cookies onto the request (for downstream getUser) and the
          // response (so the browser persists refreshed session cookies).
          for (const { name, value } of toSet) {
            request.cookies.set(name, value);
          }
          response = buildResponse();
          for (const { name, value, options } of toSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  return {
    supabase,
    response: () => response,
    // Stash a value onto the request headers that's forwarded to the route
    // handler. Used to pass the verified user id downstream so server
    // components don't need to call auth.getUser() again (saves ~80 ms).
    setRequestHeader(name: string, value: string) {
      requestHeaders.set(name, value);
      const oldCookies = response.cookies.getAll();
      response = buildResponse();
      for (const cookie of oldCookies) {
        response.cookies.set(cookie);
      }
    },
  };
}
