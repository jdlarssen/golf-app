'use server';

import { redirect } from '@/lib/nav/redirect';
import { getServerClient } from '@/lib/supabase/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { requireAdminOrClubAdminOfCup } from '@/lib/admin/auth';
import { cupBasePath } from './cupPaths';
import {
  revalidateCup,
  setFourballWithdrawalChoiceCore,
  undoCupWithdrawalCore,
  withdrawCupPlayerCore,
  withdrawSelfFromCupCore,
  type CupWithdrawalError,
} from './withdrawalCore';

/**
 * Nettets vei inn til trekket (#1814): skjemafeltene, gaten og redirecten.
 * Reglene og skrivingen bor i `withdrawalCore.ts`, delt med appens ruter (#2752).
 */

export type { CupWithdrawalError };

/**
 * Kamp-ID-ene i ett skjemafelt. Bekreftelsessiden sender én avkrysningsboks per
 * fourball-kamp, så feltet kan komme flere ganger — og lista av tilbudte kamper
 * kommer som én kommaseparert verdi. `getAll` + komma-splitt dekker begge
 * former, og settet gjør gjentakelser harmløse.
 */
function gameIdSet(formData: FormData, field: string): Set<string> {
  return new Set(
    formData
      .getAll(field)
      .flatMap((v) => String(v).split(','))
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

/** Arrangøren registrerer et trekk (E7). Se `withdrawCupPlayerCore`. */
export async function withdrawCupPlayer(formData: FormData): Promise<CupWithdrawalError> {
  const tournamentId = String(formData.get('tournament_id') ?? '').trim();
  const userId = String(formData.get('user_id') ?? '').trim();
  if (!tournamentId || !userId) return { error: 'not_found' };
  const playOnGameIds = gameIdSet(formData, 'play_on_game_ids');
  const offeredGameIds = gameIdSet(formData, 'play_on_offered_game_ids');

  const supabase = await getServerClient();
  const actor = await requireAdminOrClubAdminOfCup(supabase, tournamentId);
  const result = await withdrawCupPlayerCore(getAdminClient(), {
    tournamentId,
    userId,
    byUserId: actor.userId,
    playOnGameIds,
    offeredGameIds,
  });
  if ('error' in result) return { error: result.error };

  revalidateCup(tournamentId, actor.groupId, [...result.writtenGameIds, ...result.skippedGameIds]);
  const status =
    result.skippedGameIds.length > 0 ? 'player_withdrawn_partial' : 'player_withdrawn';
  redirect(`${cupBasePath(tournamentId, actor.groupId)}?status=${status}`);
}

/** Spilleren melder seg selv ut (E7). Se `withdrawSelfFromCupCore`. */
export async function withdrawSelfFromCup(formData: FormData): Promise<CupWithdrawalError> {
  const tournamentId = String(formData.get('tournament_id') ?? '').trim();
  if (!tournamentId) return { error: 'not_found' };

  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'not_authed' };

  const result = await withdrawSelfFromCupCore(getAdminClient(), {
    tournamentId,
    userId: user.id,
  });
  if ('error' in result) return { error: result.error };

  revalidateCup(tournamentId, result.groupId, [
    ...result.writtenGameIds,
    ...result.skippedGameIds,
  ]);
  redirect(`/cup/${tournamentId}?status=withdrawn`);
}

/** Arrangøren angrer et trekk (E7). Se `undoCupWithdrawalCore`. */
export async function undoCupWithdrawal(formData: FormData): Promise<CupWithdrawalError> {
  const tournamentId = String(formData.get('tournament_id') ?? '').trim();
  const userId = String(formData.get('user_id') ?? '').trim();
  if (!tournamentId || !userId) return { error: 'not_found' };

  const supabase = await getServerClient();
  const actor = await requireAdminOrClubAdminOfCup(supabase, tournamentId);
  const result = await undoCupWithdrawalCore(getAdminClient(), { tournamentId, userId });
  if ('error' in result) return { error: result.error };

  revalidateCup(tournamentId, actor.groupId, result.undoneGameIds);
  redirect(`${cupBasePath(tournamentId, actor.groupId)}?status=withdrawal_undone`);
}

/** Arrangøren velger om makkeren spiller alene (E4). Se `setFourballWithdrawalChoiceCore`. */
export async function setFourballWithdrawalChoice(
  formData: FormData,
): Promise<CupWithdrawalError> {
  const tournamentId = String(formData.get('tournament_id') ?? '').trim();
  const gameId = String(formData.get('game_id') ?? '').trim();
  const playOn = String(formData.get('play_on') ?? '') === '1';
  if (!tournamentId || !gameId) return { error: 'not_found' };

  const supabase = await getServerClient();
  const actor = await requireAdminOrClubAdminOfCup(supabase, tournamentId);
  const result = await setFourballWithdrawalChoiceCore(getAdminClient(), {
    tournamentId,
    gameId,
    playOn,
  });
  if ('error' in result) return { error: result.error };

  revalidateCup(tournamentId, actor.groupId, [gameId]);
  redirect(`${cupBasePath(tournamentId, actor.groupId)}?status=play_on_saved`);
}
