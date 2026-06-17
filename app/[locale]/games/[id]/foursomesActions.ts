'use server';

import { revalidateTag } from 'next/cache';
import { getServerClient } from '@/lib/supabase/server';
import { getProxyVerifiedUserId } from '@/lib/auth/userId';
import type { TablesUpdate } from '@/lib/database.types';

/**
 * Setter (eller endrer) hvem på en foursomes-side som teer ut på odd-hull.
 * Flighten kaller denne via banner-en på hull 1 før første tee-shot.
 *
 * Authz:
 *  - Krever innlogget bruker (`getProxyVerifiedUserId`)
 *  - Brukeren MÅ være medlem av siden hen setter (`game_players.team_number`
 *    matcher `sideNumber`). Andre sider kan ikke endre din sides tee-starter.
 *  - `userId` (den som skal teer odd) må også være medlem av samme side.
 *
 * Mutere `games.foursomes_side{N}_tee_starter_user_id` og revaliderer
 * `game-${gameId}`-tagen så scorekort-flatene re-rendres med oppdatert hint.
 *
 * Returnerer en kort status — feiler stille med beskjed i stedet for å kaste,
 * slik at client kan vise en in-line feilmelding.
 */
export async function setFoursomesTeeStarter(
  gameId: string,
  sideNumber: 1 | 2,
  userId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (sideNumber !== 1 && sideNumber !== 2) {
    return { ok: false, error: 'bad_side' };
  }
  const callerId = await getProxyVerifiedUserId();
  if (!callerId) return { ok: false, error: 'unauthenticated' };

  const supabase = await getServerClient();

  // Hent kaller-radens team_number for å verifisere at hen tilhører siden.
  const callerRow = await supabase
    .from('game_players')
    .select('team_number')
    .eq('game_id', gameId)
    .eq('user_id', callerId)
    .maybeSingle();
  if (callerRow.error || !callerRow.data) {
    return { ok: false, error: 'not_in_game' };
  }
  if (callerRow.data.team_number !== sideNumber) {
    return { ok: false, error: 'wrong_side' };
  }

  // Verifiser at den valgte user-en tilhører samme side.
  const candidateRow = await supabase
    .from('game_players')
    .select('team_number')
    .eq('game_id', gameId)
    .eq('user_id', userId)
    .maybeSingle();
  if (candidateRow.error || !candidateRow.data) {
    return { ok: false, error: 'candidate_not_in_game' };
  }
  if (candidateRow.data.team_number !== sideNumber) {
    return { ok: false, error: 'candidate_wrong_side' };
  }

  // Spillet må fortsatt være aktivt — endring etter finish er meningsløst.
  const gameRow = await supabase
    .from('games')
    .select('status, game_mode')
    .eq('id', gameId)
    .maybeSingle();
  if (gameRow.error || !gameRow.data) {
    return { ok: false, error: 'game_not_found' };
  }
  if (gameRow.data.status === 'finished') {
    return { ok: false, error: 'game_finished' };
  }
  if (gameRow.data.game_mode !== 'foursomes_matchplay') {
    return { ok: false, error: 'wrong_game_mode' };
  }

  // Build the update payload as a typed TablesUpdate<'games'> so the generic
  // Supabase client can validate it. The column is always one of the two
  // foursomes_side{N}_tee_starter_user_id columns — both are string | null.
  const updatePayload: TablesUpdate<'games'> =
    sideNumber === 1
      ? { foursomes_side1_tee_starter_user_id: userId }
      : { foursomes_side2_tee_starter_user_id: userId };

  const { error } = await supabase
    .from('games')
    .update(updatePayload)
    .eq('id', gameId);

  if (error) {
    console.error('[setFoursomesTeeStarter] update failed', {
      gameId,
      sideNumber,
      userId,
      error,
    });
    return { ok: false, error: 'update_failed' };
  }

  revalidateTag(`game-${gameId}`, 'max');
  return { ok: true };
}
