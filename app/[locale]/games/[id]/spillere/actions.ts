'use server';

import { getLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { expireGameCache } from '@/lib/games/expireGameCache';
import { getServerClient } from '@/lib/supabase/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { requireAdminOrCreator } from '@/lib/admin/auth';
import { readBroughtGuests, withdrawBroughtGuests } from '@/lib/games/broughtGuests';
import { expectAffected } from '@/lib/supabase/affectedRows';
import type { GameStatus } from '@/lib/games/status';
import {
  expectedTeamSize,
  modeRequiresTeamNumber,
  readShambleCount,
  teamSizeStatus,
} from '@/lib/games/teamScope';
import { allowedTeamSizes } from '@/lib/games/teamFormatLimits';
import type { GameMode } from '@/lib/scoring/modes/types';

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
 * delete runs on the request-scoped client (RLS "game_players creator delete"
 * for creators, the is_admin() branch for admins).
 *
 * Cup matches (tournament_id set) are refused for non-admins (#1937): a deleted
 * row leaves the side short and blocks auto-start (#1814). The organizer swaps
 * players on the cup instead. RLS enforces the same rule (0178) — the guard here
 * gives a predictable message instead of a silent 0-row delete.
 *
 * #2569: in a team format the team is read again after the delete, and the
 * status says what the withdrawal did (`teamSizeStatus`): the team now plays
 * one short, with its handicap worked out for those left
 * (`player_removed_team_short`, or `_shamble` where each counts their own),
 * or it has too few and must be filled before the round can start
 * (`player_removed_team_uneven`; the start guard says `uneven_teams`). The
 * read is best effort: when it fails, the removal still reports
 * `player_removed`.
 *
 * #2607: the guests the player brought leave with them (owner's rule on
 * #2570). They are read before anything is written, and withdrawn after the
 * player's row is gone, through the service-role client like `withdrawSelf`:
 * the gate is `requireAdminOrCreator` above, and the guests' requests are not
 * the organiser's to write under RLS. A failed guest withdrawal answers
 * `db_players` and the player's row is not put back: the organiser removes
 * the guests one by one, which is safer than half a rollback. Teammates with
 * an account stay where they are.
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
    redirect({ href: `${detailPath}?error=remove_missing_user`, locale });
  }

  const { data: game } = await supabase
    .from('games')
    .select('status, tournament_id, game_mode, mode_config')
    .eq('id', gameId)
    .single<{
      status: GameStatus;
      tournament_id: string | null;
      game_mode: GameMode;
      mode_config: unknown;
    }>();
  if (!game) redirect({ href: `${detailPath}?error=not_found`, locale });
  if (game.tournament_id !== null && !ctx.isAdmin) {
    redirect({ href: `${detailPath}?error=cup_roster_locked`, locale });
  }
  if (game.status !== 'draft' && game.status !== 'scheduled') {
    // Active/finished: removal isn't allowed — use withdrawal instead.
    redirect({ href: `${detailPath}?error=roster_locked`, locale });
  }

  // A failed read is not "no guests" (#1445): nothing is written then.
  const admin = getAdminClient();
  const brought = await readBroughtGuests(admin, gameId, playerUserId);
  if (!brought.ok) {
    console.error('[removePlayerFromGame] guest lookup failed', { gameId });
    redirect({ href: `${detailPath}?error=db_players`, locale });
  }

  // A delete RLS refuses matches 0 rows with error == null (trap 2), so the
  // affected rows are asserted rather than trusting the missing error.
  let removedTeam: number | null = null;
  let removed = true;
  try {
    const [row] = expectAffected(
      await supabase
        .from('game_players')
        .delete()
        .eq('game_id', gameId)
        .eq('user_id', playerUserId)
        .select('user_id, team_number'),
      'removePlayerFromGame',
    );
    removedTeam = row?.team_number ?? null;
  } catch (err) {
    console.error('[removePlayerFromGame] delete failed', err);
    removed = false;
  }
  if (!removed) {
    redirect({ href: `${detailPath}?error=db_players`, locale });
  }

  expireGameCache(gameId);
  if (!(await withdrawBroughtGuests(admin, gameId, brought.guests, ctx.userId)).ok) {
    console.error('[removePlayerFromGame] guests withdrawal failed', { gameId });
    redirect({ href: `${detailPath}?error=db_players`, locale });
  }

  // After the guests are gone, so the status counts the team that is left.
  const teamStatus = await teamStatusAfterRemoval(supabase, gameId, game, removedTeam);
  redirect({ href: `${detailPath}?${teamStatus ?? 'status=player_removed'}`, locale });
}

/**
 * #2569: the status query for a team left short by a removal, or `null` for
 * the plain `player_removed` (no team format, no team, an emptied team, a
 * full team, or a failed read).
 */
async function teamStatusAfterRemoval(
  supabase: Awaited<ReturnType<typeof getServerClient>>,
  gameId: string,
  game: { game_mode: GameMode; mode_config: unknown },
  team: number | null,
): Promise<string | null> {
  if (team === null || !game.game_mode) return null;
  const mode = game.game_mode;
  const teamSize = expectedTeamSize(game.mode_config as { team_size?: number } | null);
  if (!modeRequiresTeamNumber(mode, teamSize)) return null;

  const { data, error } = await supabase
    .from('game_players')
    .select('user_id')
    .eq('game_id', gameId)
    .eq('team_number', team)
    .is('withdrawn_at', null);
  if (error || !data) {
    console.error('[removePlayerFromGame] team re-read failed', { gameId, team, error });
    return null;
  }
  const count = data.length;
  if (count === 0) return null;

  const shambleCount = readShambleCount(game.mode_config);
  const status = teamSizeStatus(mode, teamSize, count, shambleCount);
  if (status === 'full') return null;
  if (status === 'outside') {
    // How many the team lacks up to the smallest size it may have: 2 → 1 in
    // a game à 4 lacks two, so the banner says «Flytt 2 spillere dit».
    const missing = Math.min(...allowedTeamSizes(mode, teamSize, shambleCount)) - count;
    return `status=player_removed_team_uneven&team=${team}&count=${count}&missing=${missing}`;
  }
  const code = mode === 'shamble' ? 'player_removed_team_short_shamble' : 'player_removed_team_short';
  return `status=${code}&team=${team}&count=${count}`;
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
    redirect({ href: `${detailPath}?error=cancel_missing_invitation`, locale });
  }

  const { error } = await supabase
    .from('invitations')
    .delete()
    .eq('id', invitationId)
    .eq('game_id', gameId);
  if (error) {
    console.error('[cancelGameInvitation] delete failed', error);
    redirect({ href: `${detailPath}?error=cancel_failed`, locale });
  }

  expireGameCache(gameId);
  redirect({ href: `${detailPath}?status=invite_cancelled`, locale });
}
