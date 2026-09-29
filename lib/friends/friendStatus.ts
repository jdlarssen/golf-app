/**
 * Statuskodene vennehandlingene svarer med (#2256): det ene hjemmet for
 * wire-kontrakten mellom `lib/friends/friendActionsCore.ts` (serveren),
 * webbens `?status=` og appens `data/friends.ts`. Ren og uten importer, så
 * appen kan lese den uten å dra servermoduler inn i bundelen.
 */

/** Statusene RPC-ene svarer med, pluss de to kjernen selv kan gi. */
export const FRIEND_STATUSES = [
  'requested',
  'accepted',
  'already_friends',
  'already_pending',
  'self',
  'not_found',
  'already_decided',
  'declined',
  'removed',
  'email_required',
  'error',
] as const;
export type FriendStatus = (typeof FRIEND_STATUSES)[number];

/** Utfallet av en invitasjon til en adresse som ikke er på Tørny. */
export const INVITE_STATUSES = [
  'invited',
  'email_required',
  'invalid_email',
  'disposable_email',
  'profile_incomplete',
  'quota',
  'already_user',
  'already_invited',
  'unknown',
] as const;
export type InviteStatus = (typeof INVITE_STATUSES)[number];

/** En kode vi ikke kjenner, blir «error», aldri en rå streng videre. */
export function asFriendStatus(value: unknown): FriendStatus {
  return typeof value === 'string' && (FRIEND_STATUSES as readonly string[]).includes(value)
    ? (value as FriendStatus)
    : 'error';
}

/** En invitasjonskode vi ikke kjenner, blir «unknown». */
export function asInviteStatus(value: unknown): InviteStatus {
  return typeof value === 'string' && (INVITE_STATUSES as readonly string[]).includes(value)
    ? (value as InviteStatus)
    : 'unknown';
}
