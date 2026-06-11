'use server';

import { getLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { revalidateTag } from 'next/cache';
import { getServerClient } from '@/lib/supabase/server';
import { requireAdminOrCreator } from '@/lib/admin/auth';
import type { GameStatus } from '@/lib/games/status';

/**
 * Creator/admin roster actions for the `/games/[id]/spillere` cockpit (#429).
 *
 * These complement the shared admin actions opened to creators elsewhere
 * (addExistingPlayerToGame / inviteEmailToGame in inviteToGameActions.ts;
 * adminWithdrawPlayer / adminApproveScorecard in ../actions.ts). The two below
 * are creator-surface-specific: pre-start roster removal and cancelling a
 * pending game-invite.
 */

function detailPathFor(isAdmin: boolean, gameId: string): string {
  return isAdmin ? `/admin/games/${gameId}` : `/games/${gameId}/spillere`;
}

/**
 * Remove a player from a game's roster before it starts. Only draft/scheduled —
 * once a round is active, a player leaves via withdrawal (#386), not deletion,
 * so their scores aren't silently dropped. Gated on requireAdminOrCreator; the
 * delete runs on the request-scoped client (RLS 0071 game_players creator-delete
 * for creators, admin-write for admins).
 */
export async function removePlayerFromGame(
  gameId: string,
  formData: FormData,
): Promise<void> {
  const locale = await getLocale();
  const supabase = await getServerClient();
  const ctx = await requireAdminOrCreator(supabase, gameId);
  const detailPath = detailPathFor(ctx.isAdmin, gameId);

  const playerUserId = String(formData.get('user_id') ?? '').trim();
  if (!playerUserId) {
    redirect({ href: `${detailPath}?error=remove_missing_user` as string, locale });
  }

  const { data: game } = await supabase
    .from('games')
    .select('status')
    .eq('id', gameId)
    .single<{ status: GameStatus }>();
  if (!game) redirect({ href: `${detailPath}?error=not_found` as string, locale });
  if (game!.status !== 'draft' && game!.status !== 'scheduled') {
    // Active/finished: removal isn't allowed — use withdrawal instead.
    redirect({ href: `${detailPath}?error=roster_locked` as string, locale });
  }

  const { error } = await supabase
    .from('game_players')
    .delete()
    .eq('game_id', gameId)
    .eq('user_id', playerUserId);
  if (error) {
    console.error('[removePlayerFromGame] delete failed', error);
    redirect({ href: `${detailPath}?error=db_players` as string, locale });
  }

  revalidateTag(`game-${gameId}`, 'max');
  redirect({ href: `${detailPath}?status=player_removed` as string, locale });
}

/**
 * Cancel a pending game-scoped invitation. Gated on requireAdminOrCreator; the
 * delete runs on the request-scoped client. For a creator, RLS 0072 only lets
 * them cancel invites they themselves sent (invited_by = auth.uid()); admins
 * may cancel any via admin-write.
 */
export async function cancelGameInvitation(
  gameId: string,
  formData: FormData,
): Promise<void> {
  const locale = await getLocale();
  const supabase = await getServerClient();
  const ctx = await requireAdminOrCreator(supabase, gameId);
  const detailPath = detailPathFor(ctx.isAdmin, gameId);

  const invitationId = String(formData.get('invitation_id') ?? '').trim();
  if (!invitationId) {
    redirect({ href: `${detailPath}?error=cancel_missing_invitation` as string, locale });
  }

  const { error } = await supabase
    .from('invitations')
    .delete()
    .eq('id', invitationId)
    .eq('game_id', gameId);
  if (error) {
    console.error('[cancelGameInvitation] delete failed', error);
    redirect({ href: `${detailPath}?error=cancel_failed` as string, locale });
  }

  revalidateTag(`game-${gameId}`, 'max');
  redirect({ href: `${detailPath}?status=invite_cancelled` as string, locale });
}
