import 'server-only';
import { getAdminClient } from '@/lib/supabase/admin';
import { gameInviteExpiresAtFromNow } from '@/lib/auth/inviteExpiry';
import { extendAndMailInvitation } from '@/lib/games/extendAndMailInvitation';
import { normalizeInviteEmail } from '@/lib/games/inviteEmail';
import { inviteMailSenderName } from '@/lib/games/inviteToGame';
import type { GameStatus } from '@/lib/games/status';

// The e-mail invitations a draft held, sent when it is published (#2445,
// orchestrator's decision 03.10).
//
// On a draft, «Inviter på e-post» writes (or extends) the `invitations` row
// but sends no mail (`inviteEmailToGameCore`, kind `held`). There is no send
// queue and no column for it: the set «unaccepted invitations on the game at
// the moment it goes from `draft` to `scheduled`» IS the queue. The transition
// happens once, because the publish writes with `.eq('status', 'draft')`
// (the optimistic lock in `updateGameInternal`); a concurrent click that loses
// the lock is sent to `not_editable` before it gets here.
//
// **Authz lies with the caller**, as in `notifyRosterInvites`: the module reads
// and writes with the service client and never asks who is calling. The only
// caller is `updateGameInternal`, gated with `requireAdminOrCreator`.

type GameRow = {
  id: string;
  name: string;
  game_mode: string;
  status: GameStatus;
  created_by: string | null;
};

type InvitationRow = {
  id: string;
  email: string;
  token: string;
  invited_by: string;
};

type InviterRow = { id: string; name: string | null; is_admin: boolean | null };

/**
 * Mail each held invitation on a just-published game, once, with a fresh
 * deadline.
 *
 * - Only a `scheduled` game sends: a call on a draft (or a missing game)
 *   answers `{ sent: 0, failed: 0 }`.
 * - No `expires_at` filter: a held invitation was never sent, and its
 *   deadline may have run out while the game was a draft.
 *   `extendAndMailInvitation` gives it a new one before the mail.
 * - Only invitations the organiser (`games.created_by`) or a global admin
 *   sent. `invitations` has no column for the source, and two other writers
 *   set `game_id`: a team captain's invitation (who already got the team
 *   mail) and the guest takeover (finished games only). A held invitation can
 *   only come from someone past `requireAdminOrCreator` or
 *   `gameOrganiserAccess`: the organiser or a global admin.
 * - `skipEmails`: addresses the caller mails itself in the same publish
 *   (the wizard's e-mail card through `sendPublishInvites`), so nobody gets
 *   two mails.
 *
 * Errors reading the game or the invitations throw (error ≠ absence, #1445).
 * The mails are best-effort: one failure never stops the others, and a
 * rejected mail, a refused extension or a throw all count as `failed`.
 */
export async function sendHeldGameInvites(params: {
  gameId: string;
  skipEmails: readonly string[];
}): Promise<{ sent: number; failed: number }> {
  const { gameId } = params;
  const admin = getAdminClient();

  const { data: game, error: gameError } = await admin
    .from('games')
    .select('id, name, game_mode, status, created_by')
    .eq('id', gameId)
    .maybeSingle<GameRow>();
  if (gameError) throw gameError;
  if (!game || game.status !== 'scheduled') return { sent: 0, failed: 0 };

  const { data: invitations, error: invitationsError } = await admin
    .from('invitations')
    .select('id, email, token, invited_by')
    .eq('game_id', gameId)
    .is('accepted_at', null)
    .returns<InvitationRow[]>();
  if (invitationsError) throw invitationsError;
  if (!invitations || invitations.length === 0) return { sent: 0, failed: 0 };

  const inviterIds = [...new Set(invitations.map((inv) => inv.invited_by))];
  const { data: inviters, error: invitersError } = await admin
    .from('users')
    .select('id, name, is_admin')
    .in('id', inviterIds)
    .returns<InviterRow[]>();
  if (invitersError) throw invitersError;
  const inviterById = new Map((inviters ?? []).map((u) => [u.id, u]));

  const skip = new Set(params.skipEmails.map(normalizeInviteEmail));
  const held = invitations.filter((inv) => {
    if (skip.has(normalizeInviteEmail(inv.email))) return false;
    return (
      inv.invited_by === game.created_by ||
      inviterById.get(inv.invited_by)?.is_admin === true
    );
  });

  const results = await Promise.allSettled(
    held.map((inv) => {
      const inviter = inviterById.get(inv.invited_by);
      return extendAndMailInvitation({
        client: admin,
        invitationId: inv.id,
        expiresAt: gameInviteExpiresAtFromNow(),
        mail: {
          to: inv.email,
          invitedByName: inviteMailSenderName(
            inviter?.name ?? null,
            inviter?.is_admin === true,
          ),
          gameName: game.name,
          gameMode: game.game_mode,
          inviteToken: inv.token,
        },
        label: 'sendHeldGameInvites.extendExpiry',
      });
    }),
  );

  let sent = 0;
  let failed = 0;
  results.forEach((result, i) => {
    if (result.status === 'fulfilled' && result.value === 'sent') {
      sent += 1;
      return;
    }
    failed += 1;
    // Never the address: the game and the invitation id are enough to find it.
    console.error('[sendHeldGameInvites] held invite not sent', {
      gameId,
      invitationId: held[i]!.id,
      outcome: result.status === 'fulfilled' ? result.value : 'threw',
      error: result.status === 'rejected' ? result.reason : undefined,
    });
  });
  return { sent, failed };
}
