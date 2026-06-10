'use server';

import { revalidateTag } from 'next/cache';
import { getServerClient } from '@/lib/supabase/server';
import { getProxyVerifiedUserId } from '@/lib/auth/userId';

/**
 * Setter (eller endrer) hvem på et Patsome-lag som teer ut på odd-hull i
 * foursomes-segmentet (hull 13–18). Laget kaller denne via banneret på
 * hull 13 — valget persisterer for resten av foursomes-segmentet.
 *
 * Authz:
 *  - Krever innlogget bruker.
 *  - Kaller MÅ være medlem av det angitte laget (`game_players.team_number`
 *    matcher `teamNumber`).
 *  - `userId` (den som teer odd-hull) må også være medlem av samme lag.
 *  - Spillet kan ikke være ferdig.
 *  - Spillets `game_mode` må være `'patsome'`.
 *
 * Upsert-er inn i `patsome_tee_starters` — én rad per lag per spill.
 * `revalidateTag` tvinger hull-sider til å re-rendre med oppdatert hint.
 *
 * Returnerer en kort status; feiler stille med beskrivende kode i stedet for
 * å kaste, slik at klienten kan vise en in-line feilmelding.
 */
export async function setPatsomeTeeStarter(
  gameId: string,
  teamNumber: number,
  userId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const callerId = await getProxyVerifiedUserId();
  if (!callerId) return { ok: false, error: 'unauthenticated' };

  const supabase = await getServerClient();

  // Verifiser at kaller er medlem av laget.
  const callerRow = await supabase
    .from('game_players')
    .select('team_number')
    .eq('game_id', gameId)
    .eq('user_id', callerId)
    .maybeSingle();
  if (callerRow.error || !callerRow.data) {
    return { ok: false, error: 'not_in_game' };
  }
  if (callerRow.data.team_number !== teamNumber) {
    return { ok: false, error: 'wrong_team' };
  }

  // Verifiser at den valgte brukeren er på samme lag.
  const candidateRow = await supabase
    .from('game_players')
    .select('team_number')
    .eq('game_id', gameId)
    .eq('user_id', userId)
    .maybeSingle();
  if (candidateRow.error || !candidateRow.data) {
    return { ok: false, error: 'candidate_not_in_game' };
  }
  if (candidateRow.data.team_number !== teamNumber) {
    return { ok: false, error: 'candidate_wrong_team' };
  }

  // Spillet må fortsatt være aktivt.
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
  if (gameRow.data.game_mode !== 'patsome') {
    return { ok: false, error: 'wrong_game_mode' };
  }

  const { error } = await supabase.from('patsome_tee_starters').upsert(
    {
      game_id: gameId,
      team_number: teamNumber,
      tee_starter_user_id: userId,
    },
    { onConflict: 'game_id,team_number' },
  );

  if (error) {
    console.error('[setPatsomeTeeStarter] upsert failed', {
      gameId,
      teamNumber,
      userId,
      error,
    });
    return { ok: false, error: 'upsert_failed' };
  }

  revalidateTag(`game-${gameId}`, 'max');
  return { ok: true };
}
