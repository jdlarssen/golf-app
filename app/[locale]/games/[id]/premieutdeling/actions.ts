'use server';

import { getServerClient } from '@/lib/supabase/server';
import { requireAdminOrCreator } from '@/lib/admin/auth';
import { CEREMONY_MAX_STEP, ceremonySupported } from '@/lib/games/ceremony';
import type { GameMode } from '@/lib/scoring/modes/types';

/**
 * `current` comes back when the step had moved on elsewhere (a second phone,
 * an old tab): the remote takes it instead of writing over it.
 */
export type SetCeremonyStepResult = { ok: true } | { ok: false; current?: number | null };

const validStep = (step: number | null) =>
  step === null || (Number.isInteger(step) && step >= 0 && step <= CEREMONY_MAX_STEP);

/**
 * The prize-giving's one write (#2298): how many steps the big screen shows.
 * `null` closes it and the TV goes back to «Ferdig spilt».
 *
 * Compare-and-set: the phone sends the step it shows (`from`) and the one it
 * wants (`to`), and the write only lands while the stored step is still
 * `from`. A double tap is harmless; a second phone, or a tab left open from
 * before a reopen, gets the current step back and catches up instead of
 * writing over it.
 *
 * The organiser (or an admin) only, on a finished game in a podium format.
 * RLS («games creator update» / «games admin update») is the real gate; the
 * write runs on the user's client, and 0 rows is never a success (#704).
 * No cache to expire: no cached read holds ceremony_step (the game cache's
 * select leaves it out), and the TV and the remote read it fresh.
 */
export async function setCeremonyStep(
  gameId: string,
  from: number | null,
  to: number | null,
): Promise<SetCeremonyStepResult> {
  if (!validStep(from) || !validStep(to)) return { ok: false };

  const supabase = await getServerClient();
  await requireAdminOrCreator(supabase, gameId);

  const { data: game, error: readError } = await supabase
    .from('games')
    .select('game_mode')
    .eq('id', gameId)
    .maybeSingle<{ game_mode: GameMode }>();
  if (readError || !game || !ceremonySupported(game.game_mode)) return { ok: false };

  const update = supabase
    .from('games')
    .update({ ceremony_step: to })
    .eq('id', gameId)
    .eq('status', 'finished');
  const { data: rows, error } = await (
    from === null ? update.is('ceremony_step', null) : update.eq('ceremony_step', from)
  ).select('id');
  if (error) {
    console.error('[setCeremonyStep] write failed', { gameId, from, to, error });
    return { ok: false };
  }
  if (rows && rows.length === 1) return { ok: true };

  // 0 rows: the step moved elsewhere, or the game is not finished (any more).
  const { data: now } = await supabase
    .from('games')
    .select('status, ceremony_step')
    .eq('id', gameId)
    .maybeSingle<{ status: string; ceremony_step: number | null }>();
  return now?.status === 'finished' ? { ok: false, current: now.ceremony_step } : { ok: false };
}
