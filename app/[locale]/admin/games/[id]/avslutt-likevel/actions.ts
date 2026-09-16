'use server';

import { redirect } from '@/i18n/navigation';
import { getLocale } from 'next-intl/server';
import { expireGameCache } from '@/lib/games/expireGameCache';
import { getServerClient } from '@/lib/supabase/server';
import { requireAdminOrCreator } from '@/lib/admin/auth';
import {
  expectAffected,
  NoRowsAffectedError,
} from '@/lib/supabase/affectedRows';
import { supportsWithdrawal } from '@/lib/scoring';
import type { GameMode } from '@/lib/scoring/modes/types';
import type { GameStatus } from '@/lib/games/status';
import { endGame } from '../actions';

/**
 * «Avslutt likevel» with per-player WD opt-in (#386).
 *
 * Called from both confirm pages: `/admin/games/[id]/avslutt-likevel` (admin)
 * and `/games/[id]/avslutt` (the game's creator, #427). Gated by
 * requireAdminOrCreator; every redirect branches on isAdmin, so a creator never
 * lands in the admin shell.
 *
 * Flow:
 *  0. Read the game. A failed read → `?error=db_players`; a game that is no
 *     longer active (a stale tab, #2031) → `?error=not_active` on the detail
 *     page. Either way: no roster read, no write, no finish.
 *  1. Collect the ticked `withdraw_<userId>` checkboxes (deduped; none at all
 *     for modes without withdrawal support). Nothing ticked → step 4.
 *  2. Pre-read the ticked rows (#1986, the app's all-or-nothing rule from
 *     #1856/#1896). A ticked player who is missing from the roster, has
 *     submitted, or is already withdrawn sends the organiser back to the
 *     confirm page with `?error=roster_changed`: no write, no finish.
 *  3. ONE guarded UPDATE withdrawing those players (only while `submitted_at`
 *     and `withdrawn_at` are still null), row-counted through expectAffected
 *     (#1886, trap 2). Fewer rows than ticked (a race after the pre-read) →
 *     roster_changed as well, after revalidating the game for the rows that
 *     did commit. A DB error → `?error=db_players` on the detail page.
 *  4. `endGame(gameId, true)` (allowMissing): unticked players keep their
 *     scores counting as «ikke levert». endGame owns the final redirect.
 */
export async function endGameMarkingWithdrawals(
  gameId: string,
  formData: FormData,
) {
  const locale = await getLocale();
  const supabase = await getServerClient();
  const role = await requireAdminOrCreator(supabase, gameId);

  const detailPath = role.isAdmin
    ? `/admin/games/${gameId}`
    : `/games/${gameId}`;
  // A lost race goes back to the confirm page the organiser came from: it
  // re-reads the roster, so the list there is the explanation.
  const rosterChangedPath = role.isAdmin
    ? `/admin/games/${gameId}/avslutt-likevel?error=roster_changed`
    : `/games/${gameId}/avslutt?error=roster_changed`;

  // WD is only valid for in-scope modes. Out-of-scope games get NO withdrawals
  // even from a crafted POST — they fall back to «ikke levert» (defense-in-depth
  // mirroring the page, which hides the checkboxes for these modes).
  const { data: game, error: gameError } = await supabase
    .from('games')
    .select('game_mode, status')
    .eq('id', gameId)
    .single<{ game_mode: GameMode; status: GameStatus }>();
  // Fail closed: a failed read would otherwise drop every tick (allowWd false)
  // and still finish the game with those players counted as active.
  if (gameError) {
    console.error('[endGameMarkingWithdrawals] game read failed', gameError);
    redirect({ href: `${detailPath}?error=db_players`, locale });
  }
  // A stale confirm tab on a game that is no longer active (#2031): stop before
  // any roster I/O. endGame would refuse it too, but only AFTER the withdrawal
  // write below had committed. Same gate and target as adminWithdrawPlayer.
  if (!game || game.status !== 'active') {
    redirect({ href: `${detailPath}?error=not_active`, locale });
  }
  const allowWd = game ? supportsWithdrawal(game.game_mode) : false;

  // Collect all withdraw_<userId> keys that are checked. Deduped so a repeated
  // key can never make the row count below disagree with the ids asked for.
  const withdrawUserIds: string[] = allowWd
    ? [
        ...new Set(
          [...formData.entries()]
            .filter(
              ([key, value]) => key.startsWith('withdraw_') && value === 'on',
            )
            .map(([key]) => key.slice('withdraw_'.length)),
        ),
      ]
    : [];

  if (withdrawUserIds.length > 0) {
    // Pre-read (#1986, mirror of the app's `lateSubmitters`). This guard has to
    // live HERE: endGameCore under allowMissing only skips missing players and
    // never checks whether a ticked one managed to submit.
    const { data: ticked, error: readError } = await supabase
      .from('game_players')
      .select('user_id, submitted_at, withdrawn_at')
      .eq('game_id', gameId)
      .in('user_id', withdrawUserIds);
    if (readError) {
      console.error(
        '[endGameMarkingWithdrawals] roster pre-read failed',
        readError,
      );
      redirect({ href: `${detailPath}?error=db_players`, locale });
    }
    // Stop before writing when any ticked player is missing from the roster
    // (removed, or a crafted id), has submitted, or is already withdrawn.
    const tickedRows = ticked ?? [];
    if (
      tickedRows.length !== withdrawUserIds.length ||
      tickedRows.some(
        (row) => row.submitted_at !== null || row.withdrawn_at !== null,
      )
    ) {
      redirect({ href: rosterChangedPath, locale });
    }

    // ONE guarded write. The `.is` filters close the window between the
    // pre-read and this UPDATE; `.select` lets us count what it hit. Uses the
    // cookie server client under the game_players RLS policies (admin, or the
    // creator via "game_players creator update") — requireAdminOrCreator above
    // gates the call.
    const written = await supabase
      .from('game_players')
      .update({
        withdrawn_at: new Date().toISOString(),
        withdrawn_by_user_id: role.userId,
      })
      .eq('game_id', gameId)
      .in('user_id', withdrawUserIds)
      .is('submitted_at', null)
      .is('withdrawn_at', null)
      .select('user_id');

    // Only expectAffected sits in the try: redirect() throws NEXT_REDIRECT, and
    // a catch that reroutes must never swallow it.
    let withdrawnCount = 0;
    try {
      withdrawnCount = expectAffected(
        written,
        'endGameMarkingWithdrawals',
      ).length;
    } catch (err) {
      // 0 rows is a race (everyone ticked submitted or was withdrawn in the
      // meantime), not a DB failure. instanceof (not constructor.name) survives
      // prod minification — same idiom as reopenScorecard.
      if (err instanceof NoRowsAffectedError) {
        redirect({ href: rosterChangedPath, locale });
      }
      console.error('[endGameMarkingWithdrawals] withdraw update failed', err);
      redirect({ href: `${detailPath}?error=db_players`, locale });
    }
    // Partial hit: somebody slipped through between pre-read and write. Those
    // who were withdrawn stay withdrawn (undo lives on the roster page); the
    // game is not ended, and the confirm page shows the true state.
    if (withdrawnCount !== withdrawUserIds.length) {
      // Those rows committed, but endGame never runs, so nothing else
      // revalidates the cached game for them.
      if (withdrawnCount > 0) expireGameCache(gameId);
      redirect({ href: rosterChangedPath, locale });
    }
  }

  // Delegate to endGame with allowMissing=true. It skips withdrawn players
  // and remaining no-shows alike (contract #386). endGame handles the redirect.
  await endGame(gameId, true);
}
