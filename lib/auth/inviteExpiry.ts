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

const OSLO = 'Europe/Oslo';

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
