/**
 * Curated set of well-known disposable / throwaway email-inbox providers
 * (#365). These services hand out public, readable inboxes — exactly the
 * cheap way to mass-create accounts once open self-registration is on,
 * because an attacker can read the OTP code straight from the public inbox.
 *
 * Deliberately a small, high-confidence vendored list rather than the
 * ~3600-entry `disposable-email-domains` npm package: zero dependency, no
 * supply-chain surface, deterministic to test, and it covers the vast
 * majority of real abuse. Per the «usynlig til vi ser misbruk»-decision,
 * we start lean. Escalation path if abuse slips through: add the offending
 * domain here (quick patch), then the npm list or captcha (separate work).
 *
 * Every entry is lowercase and is the base registrable domain. Matching is
 * exact (see `isDisposableEmailDomain`) — subdomains are not expanded.
 */
export const DISPOSABLE_EMAIL_DOMAINS: ReadonlySet<string> = new Set([
  // Mailinator family
  'mailinator.com',
  'mailinator.net',
  'mailinator.org',
  // Guerrilla Mail family
  'guerrillamail.com',
  'guerrillamail.net',
  'guerrillamail.org',
  'guerrillamail.biz',
  'guerrillamail.de',
  'guerrillamailblock.com',
  'sharklasers.com',
  'grr.la',
  'spam4.me',
  // 10 Minute Mail family
  '10minutemail.com',
  '10minutemail.net',
  '10minutemail.org',
  // YOPmail family
  'yopmail.com',
  'yopmail.net',
  'yopmail.fr',
  // Temp-Mail family
  'temp-mail.org',
  'temp-mail.io',
  'tempmail.com',
  'tempmailo.com',
  'tempr.email',
  // 1secmail family
  '1secmail.com',
  '1secmail.net',
  '1secmail.org',
  // Other widely-used throwaway services
  'getnada.com',
  'trashmail.com',
  'trash-mail.com',
  'throwawaymail.com',
  'maildrop.cc',
  'dispostable.com',
  'fakeinbox.com',
  'mailnesia.com',
  'mintemail.com',
  'mohmal.com',
  'emailondeck.com',
  'moakt.com',
  'dropmail.me',
  'discard.email',
  'discardmail.com',
  'mailcatch.com',
  'harakirimail.com',
  'spambog.com',
  'mvrht.net',
  '33mail.com',
  'anonbox.net',
  'mailsac.com',
  'cs.email',
  'getairmail.com',
  'inboxkitten.com',
  'mailpoof.com',
  'tmail.ws',
  'tmailor.com',
  'mailtemp.net',
]);
