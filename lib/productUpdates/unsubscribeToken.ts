import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Signerte unsub-tokens for månedlig mail-digest (issue #202).
 *
 * Format: base64url(`${userId}.${expMs}.${sig}`) der sig =
 * HMAC-SHA256(`${userId}.${expMs}`, secret). expMs er ms-since-epoch
 * som tall-streng — ikke ISO — for å unngå at millisekund-punktum
 * (`.000Z`) bryter split('.').
 *
 * Token utløper etter 1 år — lenge nok til at en gammel mail i innboksen
 * fortsatt kan brukes til å unsub-e, kort nok til at secret-rotasjon ikke
 * etterlater zombie-tokens i evig drift.
 *
 * Secret leses fra PRODUCT_UPDATE_UNSUB_SECRET. Hvis ikke satt, kaster
 * sign-funksjonen — vi vil ikke shippe mail med tomme/predictable tokens.
 */

const TOKEN_TTL_MS = 365 * 24 * 60 * 60 * 1000;

function getSecret(): string {
  const secret = process.env.PRODUCT_UPDATE_UNSUB_SECRET;
  if (!secret) {
    throw new Error('PRODUCT_UPDATE_UNSUB_SECRET is not set');
  }
  return secret;
}

function sign(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

export function signUnsubToken(userId: string, nowMs: number = Date.now()): string {
  const expMs = nowMs + TOKEN_TTL_MS;
  const payload = `${userId}.${expMs}`;
  const sig = sign(payload, getSecret());
  return Buffer.from(`${payload}.${sig}`, 'utf8').toString('base64url');
}

export function verifyUnsubToken(
  token: string,
  nowMs: number = Date.now(),
): { userId: string } | null {
  if (!token) return null;

  let decoded: string;
  try {
    decoded = Buffer.from(token, 'base64url').toString('utf8');
  } catch {
    return null;
  }

  const parts = decoded.split('.');
  if (parts.length !== 3) return null;
  const [userId, expMsStr, providedSig] = parts as [string, string, string];

  if (!userId || !expMsStr || !providedSig) return null;

  const expMs = Number.parseInt(expMsStr, 10);
  if (!Number.isFinite(expMs)) return null;
  if (expMs < nowMs) return null;

  const expectedSig = sign(`${userId}.${expMsStr}`, getSecret());

  // Constant-time sammenligning av sig-strenger. Vi sjekker lengde først
  // siden timingSafeEqual kaster på mismatched length.
  const expectedBuf = Buffer.from(expectedSig, 'utf8');
  const providedBuf = Buffer.from(providedSig, 'utf8');
  if (expectedBuf.length !== providedBuf.length) return null;
  if (!timingSafeEqual(expectedBuf, providedBuf)) return null;

  return { userId };
}
