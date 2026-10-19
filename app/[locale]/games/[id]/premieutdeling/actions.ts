'use server';

import { getServerClient } from '@/lib/supabase/server';
import { requireAdminOrCreator } from '@/lib/admin/auth';
import { expectOne } from '@/lib/supabase/affectedRows';
import { CEREMONY_MAX_STEP, ceremonySupported } from '@/lib/games/ceremony';
import type { GameMode } from '@/lib/scoring/modes/types';

export type SetCeremonyStepResult = { ok: true } | { ok: false };

/**
 * The prize-giving's one write (#2298): how many steps the big screen shows.
 * `null` closes it and the TV goes back to «Ferdig spilt».
 *
 * The step is absolute, never «+1», so a double tap sets the same value twice.
 * The organiser (or an admin) only, on a finished game in a podium format.
 * RLS («games creator update» / «games admin update») is the real gate; the
 * write runs on the user's client, and 0 rows — a game that is not finished,
 * or one the caller may not write — is a failure, not a success (#704).
 */
export async function setCeremonyStep(
  gameId: string,
  step: number | null,
): Promise<SetCeremonyStepResult> {
  if (step !== null && !(Number.isInteger(step) && step >= 0 && step <= CEREMONY_MAX_STEP)) {
    return { ok: false };
  }

  const supabase = await getServerClient();
  await requireAdminOrCreator(supabase, gameId);

  const { data: game, error: readError } = await supabase
    .from('games')
    .select('game_mode')
    .eq('id', gameId)
    .maybeSingle<{ game_mode: GameMode }>();
  if (readError || !game || !ceremonySupported(game.game_mode)) return { ok: false };

  try {
    expectOne(
      await supabase
        .from('games')
        .update({ ceremony_step: step })
        .eq('id', gameId)
        .eq('status', 'finished')
        .select('id'),
      'setCeremonyStep',
    );
  } catch (err) {
    console.error('[setCeremonyStep] write failed', { gameId, step, err });
    return { ok: false };
  }

  // No cache to expire: no cached read holds ceremony_step (the game cache's
  // select leaves it out), and the TV and this page read it fresh.
  return { ok: true };
}
