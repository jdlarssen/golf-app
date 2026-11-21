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

/**
 * Svaret på «Legg til venn på e-post» (0252). `requested` er det ene svaret
 * for alle adresser: har adressen en konto, får personen en forespørsel, og
 * har den ikke, får adressen en invitasjon. De andre kodene avhenger bare av
 * den som spør og av adressen slik den er skrevet.
 */
export const ADD_BY_EMAIL_STATUSES = [
  'requested',
  'self',
  'email_required',
  'invalid_email',
  'disposable_email',
  'profile_incomplete',
  'quota',
  'error',
] as const;
export type AddByEmailStatus = (typeof ADD_BY_EMAIL_STATUSES)[number];

/**
 * Kodene `POST /api/friends/invite` svarer med. Ruta finnes for appbygg fra
 * før 0252. `already_user` og `already_invited` sendes ikke lenger; de står
 * her fordi de byggene har en linje for dem.
 */
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

/**
 * Forholdet `GET /api/friends/link/[code]` svarer med (#2627): hvem
 * venne-lenka tilhører, sett fra den som åpner den.
 */
export const FRIEND_LINK_RELATIONS = ['self', 'already_friends', 'connectable'] as const;
export type FriendLinkRelation = (typeof FRIEND_LINK_RELATIONS)[number];

/** En kode vi ikke kjenner, blir «error», aldri en rå streng videre. */
export function asFriendStatus(value: unknown): FriendStatus {
  return typeof value === 'string' && (FRIEND_STATUSES as readonly string[]).includes(value)
    ? (value as FriendStatus)
    : 'error';
}

/** Et svar på «Legg til venn på e-post» vi ikke kjenner, blir «error». */
export function asAddByEmailStatus(value: unknown): AddByEmailStatus {
  return typeof value === 'string' && (ADD_BY_EMAIL_STATUSES as readonly string[]).includes(value)
    ? (value as AddByEmailStatus)
    : 'error';
}

/** En invitasjonskode vi ikke kjenner, blir «unknown». */
export function asInviteStatus(value: unknown): InviteStatus {
  return typeof value === 'string' && (INVITE_STATUSES as readonly string[]).includes(value)
    ? (value as InviteStatus)
    : 'unknown';
}
