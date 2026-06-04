import { DISPOSABLE_EMAIL_DOMAINS } from './disposableDomains';

/**
 * Returns true when `email`'s domain is a known disposable / throwaway
 * inbox provider (#365). Used by the /login `sendCode` action to refuse
 * such addresses while open self-registration is on — they're the cheap
 * mass-account-creation vector (public, readable inboxes).
 *
 * Pure and total: never throws. Malformed input (no `@`, empty domain)
 * returns false so callers fall through to their normal validation.
 * Matching is exact on the lowercased domain — no subdomain/suffix
 * expansion, to avoid false positives on legitimate domains that merely
 * contain a disposable name as a substring.
 */
export function isDisposableEmailDomain(email: string): boolean {
  const at = email.lastIndexOf('@');
  if (at === -1) return false;

  const domain = email.slice(at + 1).trim().toLowerCase();
  if (!domain) return false;

  return DISPOSABLE_EMAIL_DOMAINS.has(domain);
}
