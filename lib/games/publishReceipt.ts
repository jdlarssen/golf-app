import { inboxPerson } from '@/lib/notifications/inboxSections';
import { displayNameForOthers } from '@/lib/users/displayName';

/**
 * The receipt after «Publiser» (#2458): who it says got the invitation, and
 * which line it shows. Pure, so the page and its tests share one rule.
 */

/** A roster row as the cached game payload has it (`getGameWithPlayers`). */
export type ReceiptRosterPlayer = {
  user_id: string;
  withdrawn_at: string | null;
  users: { name: string | null; nickname: string | null; is_guest: boolean } | null;
};

/** `shortName` is null for a player without a name: they count, unnamed. */
export type ReceiptInvitee = { userId: string; shortName: string | null };

/** Names in clear text before the rest becomes «og N til». */
const MAX_NAMES = 3;

/**
 * The players who got the `invite` notice when the game was published: the
 * same people as `notifyRosterInvites` picks (not the one who published, not
 * the organiser, no guests, no withdrawn players), without its «already
 * invited» filter, since the receipt says who *has* the invitation.
 *
 * The short name is the one the «Flytt runden» line and the inbox use: the
 * first name, never the nickname. The cached roster carries no e-mail, so a
 * player without a name stays unnamed.
 */
export function receiptInvitees(input: {
  players: readonly ReceiptRosterPlayer[];
  createdBy: string | null;
  publisherId: string;
}): ReceiptInvitee[] {
  const { players, createdBy, publisherId } = input;
  return players
    .filter(
      (p) =>
        p.withdrawn_at == null &&
        p.user_id !== publisherId &&
        p.user_id !== createdBy &&
        p.users?.is_guest !== true,
    )
    .map((p) => ({
      userId: p.user_id,
      shortName: p.users
        ? (inboxPerson(displayNameForOthers({ ...p.users, email: null }))?.short ?? null)
        : null,
    }));
}

/**
 * Up to three names in roster order, and how many more there are. A player
 * without a name is always one of the «more».
 */
export function receiptNameParts(invitees: readonly ReceiptInvitee[]): {
  names: string[];
  more: number;
} {
  const names = invitees
    .map((i) => i.shortName)
    .filter((n): n is string => n != null)
    .slice(0, MAX_NAMES);
  return { names, more: invitees.length - names.length };
}

export type ReceiptLineKind = 'names' | 'names_and_email' | 'email_only' | 'none_with_link' | 'none';

/**
 * Which line goes under the title. Players on the list come first, then the
 * e-mail invitations (addresses without an account). With nobody invited, the
 * line points to the link when the game has one to share.
 */
export function receiptLineKind(input: {
  invitees: number;
  emailInvites: number;
  hasShareLink: boolean;
}): ReceiptLineKind {
  const { invitees, emailInvites, hasShareLink } = input;
  if (invitees > 0) return emailInvites > 0 ? 'names_and_email' : 'names';
  if (emailInvites > 0) return 'email_only';
  return hasShareLink ? 'none_with_link' : 'none';
}
