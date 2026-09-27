import { headers } from 'next/headers';
import { readVerifiedUserId } from './proxyIdentity';

/**
 * Read the verified user id forwarded by proxy.ts after `auth.getUser()`.
 * Returns null if the request didn't go through the proxy — callers should
 * fall back to `supabase.auth.getUser()` in that rare case (e.g. routes
 * excluded from the matcher).
 *
 * The proxy signs the id it forwards (lib/auth/proxyIdentity.ts); an
 * unsigned or wrongly signed header reads as null.
 */
export async function getProxyVerifiedUserId(): Promise<string | null> {
  return readVerifiedUserId(await headers());
}
