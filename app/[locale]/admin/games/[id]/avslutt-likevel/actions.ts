'use server';

import { redirect } from '@/i18n/navigation';
import { getLocale } from 'next-intl/server';
import { getServerClient } from '@/lib/supabase/server';
import { requireAdminOrCreator } from '@/lib/admin/auth';
import {
  expectAffected,
  NoRowsAffectedError,
} from '@/lib/supabase/affectedRows';
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
 * All-or-nothing against a late submission (#1986, the app's rule from
 * #1856/#1896): if any ticked player submitted (or was withdrawn) between
 * page load and the click, nothing is written and the game is NOT ended; the
 * organiser lands back on the confirm page with `?error=roster_changed` and
 * sees the fresh roster. The withdrawal write is row-counted (#1886, trap 2),
 * so a silently no-oped write can no longer end the game with a ticked player
 * still counted as active.
 *
 * Must be called from an avslutt-likevel confirm page. Requires admin OR the
 * game's creator (#427), gated via requireAdminOrCreator. Redirects branch on
 * isAdmin so a creator lands on /games/[id] instead of the admin shell.
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
  const { data: game } = await supabase
    .from('games')
    .select('game_mode')
    .eq('id', gameId)
    .single<{ game_mode: GameMode }>();
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
    if (
      (ticked ?? []).some(
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
      redirect({ href: rosterChangedPath, locale });
    }
  }

  // Delegate to endGame with allowMissing=true. It skips withdrawn players
  // and remaining no-shows alike (contract #386). endGame handles the redirect.
  await endGame(gameId, true);
}
