'use server';

import { getLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { getServerClient } from '@/lib/supabase/server';
import {
  undoSelfWithdraw,
  withdrawSelf,
  type SelfWithdrawError,
} from '@/lib/games/withdrawSelf';

/**
 * Webbens vei inn til selv-frafall (#199 chunk 11, #386 chunk 3).
 *
 * Regelen selv bor i `lib/games/withdrawSelf.ts` siden #1917 — appen kaller den
 * samme kjernen gjennom `app/api/games/[id]/withdraw-self`, og en kopi her ville
 * gitt regelen to hjem (AGENTS trap 4). Det som er igjen i denne fila er porten:
 * hvem ringer, og hvor sendes en uten sesjon? Samme arbeidsdeling som
 * `remindUnsubmittedPlayers` på admin-status-siden.
 */

export type WithdrawError = SelfWithdrawError | 'not_authed';

export type WithdrawResult =
  // `kept` = the game_players row still exists after the call (active soft-WD).
  // false = the row was deleted (pre-start withdrawal). The form wrapper uses it
  // to decide where to land: game home (kept) vs app home.
  | { ok: true; kept: boolean }
  | { ok: false; error: WithdrawError };

export async function withdrawFromGame(
  gameId: string,
): Promise<WithdrawResult> {
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    const locale = await getLocale();
    redirect({ href: '/login', locale });
  }

  return withdrawSelf(gameId, user!.id);
}

/** Angre eget frafall under aktivt spill (#386 chunk 3). Samme port. */
export async function undoWithdraw(
  gameId: string,
): Promise<WithdrawResult> {
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    const locale = await getLocale();
    redirect({ href: '/login', locale });
  }

  return undoSelfWithdraw(gameId, user!.id);
}
