import { headers } from 'next/headers';

/**
 * Read the verified user id forwarded by proxy.ts after `auth.getUser()`.
 * Returns null if the request didn't go through the proxy — callers should
 * fall back to `supabase.auth.getUser()` in that rare case (e.g. routes
 * excluded from the matcher).
 *
 * The header is set on the request that the proxy hands to the route
 * handler — the browser never sees or sets it.
 */
export async function getProxyVerifiedUserId(): Promise<string | null> {
  const h = await headers();
  return h.get('x-torny-user-id');
}
