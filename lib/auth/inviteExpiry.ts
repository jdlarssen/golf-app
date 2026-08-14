// Calendar-day countdown to an invitation's expiry (#1179 — mild tap-aversion).
//
// The invite context card on /login (#1169) shows the invitee a friendly,
// forward-looking deadline: «utløper i dag / i morgen / om N dager». The card
// is server-rendered per request, so a relative countdown never goes stale the
// way a mail (read days later) would — hence the mail uses an absolute date and
// the card uses this relative tier.
//
// Locale-independent classifier: it returns which tier the deadline falls in,
// the actual wording lives in the `auth.inviteCard.*` catalog so every locale
// gets its own phrasing via next-intl (the N-locale criterion, #845). Same
// shape as `countdownParts` in lib/i18n/format.ts.
//
// The module also owns the deadline itself: the TTL constant, the stamp a new
// (or revived) invitation gets, and the has-it-passed check the admin waiting
// list renders its «Utløpt»-badge from (#1381).

const OSLO = 'Europe/Oslo';

/**
 * How long a fresh invitation stays valid. ONE home for the number (AGENTS.md
 * trap 4): the admin invite-flow stamps `expires_at` with it on insert, and
 * «Send på nytt» (#1381) pushes the deadline out by the same span — so the two
 * doors can never drift apart.
 */
export const INVITE_TTL_DAYS = 7;

const INVITE_TTL_MS = INVITE_TTL_DAYS * 24 * 60 * 60 * 1000;

/**
 * The ISO instant to write into `invitations.expires_at` for an invitation
 * issued (or revived) at `nowMs`.
 */
export function inviteExpiresAtFromNow(nowMs: number = Date.now()): string {
  return new Date(nowMs + INVITE_TTL_MS).toISOString();
}

/**
 * GAME invitations live longer than admin invitations: a game is often set up
 * a week or two before tee-off, and the invite should survive until then. The
 * span itself is unchanged from the historical inline value (#1613 gave it
 * this one home); both the fresh-insert path and «Send på nytt» in the game
 * invite flow stamp from here, so the two can never drift apart.
 */
export const GAME_INVITE_TTL_DAYS = 14;

const GAME_INVITE_TTL_MS = GAME_INVITE_TTL_DAYS * 24 * 60 * 60 * 1000;

/**
 * The ISO instant to write into `invitations.expires_at` for a GAME
 * invitation issued (or revived) at `nowMs`.
 */
export function gameInviteExpiresAtFromNow(nowMs: number = Date.now()): string {
  return new Date(nowMs + GAME_INVITE_TTL_MS).toISOString();
}

/**
 * Has the deadline passed? Mirrors the DB gate in `email_is_invited`
 * (open = `expires_at > now()`, migration 0100), so the «Utløpt»-badge in the
 * admin waiting list agrees with what the login door will actually do.
 *
 * `expires_at` is NOT NULL and always DB-written, so an unparseable stamp is a
 * can't-happen — it reads as not-expired rather than raising a false alarm on
 * a row that may well be fine. `nowMs` is injectable for deterministic tests.
 */
export function isInviteExpired(
  expiresAtIso: string,
  nowMs: number = Date.now(),
): boolean {
  const expMs = Date.parse(expiresAtIso);
  if (Number.isNaN(expMs)) return false;
  return expMs <= nowMs;
}

/**
 * Days since the Unix epoch for the given instant's Oslo *calendar* date.
 * Comparing two of these gives whole-calendar-day distance in Oslo wall-clock,
 * so «i morgen» means the expiry lands on tomorrow's Oslo date — not merely
 * "24 hours away", which would drift across midnight and mislead.
 */
function osloDayIndex(ms: number): number {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: OSLO,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(ms));
  const y = parts.find((p) => p.type === 'year')?.value ?? '1970';
  const m = parts.find((p) => p.type === 'month')?.value ?? '01';
  const d = parts.find((p) => p.type === 'day')?.value ?? '01';
  return Math.floor(Date.parse(`${y}-${m}-${d}T00:00:00Z`) / 86_400_000);
}

export type InviteExpiryTier =
  | { kind: 'today' }
  | { kind: 'tomorrow' }
  | { kind: 'days'; days: number };

/**
 * Which countdown tier an invitation's `expires_at` falls in, by Oslo calendar
 * day. `getInviteLoginContext` only surfaces invitations whose `expires_at` is
 * still in the future, so the card never faces an expired one — but a same-day
 * expiry (or defensively, a past instant) floors to `today` rather than ever
 * emitting «om 0 dager». `days` is always ≥ 2 (0 → today, 1 → tomorrow).
 *
 * Returns `null` for an unparseable timestamp so the caller renders no line.
 * `nowMs` is injectable for deterministic tests.
 */
export function inviteExpiryTier(
  expiresAtIso: string,
  nowMs: number = Date.now(),
): InviteExpiryTier | null {
  const expMs = Date.parse(expiresAtIso);
  if (Number.isNaN(expMs)) return null;

  const diff = osloDayIndex(expMs) - osloDayIndex(nowMs);
  if (diff <= 0) return { kind: 'today' };
  if (diff === 1) return { kind: 'tomorrow' };
  return { kind: 'days', days: diff };
}
