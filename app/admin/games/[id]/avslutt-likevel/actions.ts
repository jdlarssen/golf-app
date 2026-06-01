'use server';

import { redirect } from 'next/navigation';
import { getServerClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/admin/auth';
import { supportsWithdrawal } from '@/lib/scoring';
import type { GameMode } from '@/lib/scoring/modes/types';
import { endGame } from '../actions';

/**
 * «Avslutt likevel» with per-player WD opt-in (#386).
 *
 * For each `withdraw_<userId>` checkbox set to `'on'` in formData, marks
 * that player as withdrawn (sets `withdrawn_at` + `withdrawn_by_user_id`)
 * before calling `endGame(gameId, true)` (allowMissing). Players without
 * the checkbox ticked keep their scores counting as «ikke levert».
 *
 * Must be called from the avslutt-likevel confirm page. Requires admin.
 */
export async function endGameMarkingWithdrawals(
  gameId: string,
  formData: FormData,
) {
  const supabase = await getServerClient();
  const role = await requireAdmin(supabase);

  const detailPath = `/admin/games/${gameId}`;

  // WD is only valid for in-scope modes. Out-of-scope games get NO withdrawals
  // even from a crafted POST — they fall back to «ikke levert» (defense-in-depth
  // mirroring the page, which hides the checkboxes for these modes).
  const { data: game } = await supabase
    .from('games')
    .select('game_mode')
    .eq('id', gameId)
    .single<{ game_mode: GameMode }>();
  const allowWd = game ? supportsWithdrawal(game.game_mode) : false;

  // Collect all withdraw_<userId> keys that are checked.
  const withdrawUserIds: string[] = allowWd
    ? [...formData.entries()]
        .filter(([key, value]) => key.startsWith('withdraw_') && value === 'on')
        .map(([key]) => key.slice('withdraw_'.length))
    : [];

  // Mark each opted-in player as withdrawn. Uses the cookie server client
  // under the admin RLS policy (same pattern as reopenScorecard) — requireAdmin
  // above gates the call.
  for (const userId of withdrawUserIds) {
    const { error } = await supabase
      .from('game_players')
      .update({
        withdrawn_at: new Date().toISOString(),
        withdrawn_by_user_id: role.userId,
      })
      .eq('game_id', gameId)
      .eq('user_id', userId);
    if (error) {
      redirect(`${detailPath}?error=db_players`);
    }
  }

  // Delegate to endGame with allowMissing=true. It skips withdrawn players
  // and remaining no-shows alike (contract #386). endGame handles the redirect.
  await endGame(gameId, true);
}
