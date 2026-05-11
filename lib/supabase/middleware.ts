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
  let response = NextResponse.next({ request });

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
          response = NextResponse.next({ request });
          for (const { name, value, options } of toSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  return { supabase, response: () => response };
}
