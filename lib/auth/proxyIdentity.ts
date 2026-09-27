import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * The verified-user header pair that proxy.ts forwards to route handlers
 * (#2206). The proxy signs the user id with an HMAC keyed on the server's
 * service-role key; `readVerifiedUserId` accepts only an id whose signature
 * checks out, so a header the proxy did not set reads as no user.
 *
 * No `next/*` imports: proxy.ts imports this module.
 */
const USER_HEADER = 'x-torny-user-id';
const SIG_HEADER = 'x-torny-user-sig';

function signingKey(): string | null {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || null;
}

function sign(userId: string, key: string): string {
  return createHmac('sha256', key).update(`torny-proxy-identity:v1:${userId}`).digest('base64url');
}

export function clearVerifiedUser(h: Headers): void {
  h.delete(USER_HEADER);
  h.delete(SIG_HEADER);
}

export function setVerifiedUser(h: Headers, userId: string): void {
  clearVerifiedUser(h);
  const key = signingKey();
  if (!key) {
    // Fail closed: without a key no identity is forwarded, so every page
    // treats the request as signed out.
    console.error('[proxyIdentity] SUPABASE_SERVICE_ROLE_KEY missing; verified-user header not set');
    return;
  }
  h.set(USER_HEADER, userId);
  h.set(SIG_HEADER, sign(userId, key));
}

export function readVerifiedUserId(h: Pick<Headers, 'get'>): string | null {
  const userId = h.get(USER_HEADER);
  const sig = h.get(SIG_HEADER);
  const key = signingKey();
  if (!userId || !sig || !key) return null;
  const expected = Buffer.from(sign(userId, key));
  const actual = Buffer.from(sig);
  return expected.length === actual.length && timingSafeEqual(expected, actual) ? userId : null;
}
