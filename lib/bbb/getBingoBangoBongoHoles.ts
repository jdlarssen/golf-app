import 'server-only';
import { unstable_cache } from 'next/cache';
import { getAdminClient } from '@/lib/supabase/admin';
import type { BingoBangoBongoHoleInput } from '@/lib/scoring/modes/types';

/**
 * Tag-cached fetch av bingo_bango_bongo_holes for ett spill.
 *
 * Returnerer alle hull-rader sortert på hole_number ASC. Brukes av scoring-laget
 * (mater inn i `ScoringContext.bingoBangoBongoHoles`) og av leaderboard/hull-UI.
 *
 * Cache-tag: `game-${id}` — samme som `getGameWithPlayers`. Mutasjons-server-
 * actions (`setBingoBangoBongoHole`) revaliderer denne ved hver endring. 15-min
 * revalidate som safety net for direkte DB-endringer.
 *
 * Bruker admin-client (cookies() kan ikke kalles inne i unstable_cache).
 * Authz håndheves på call-site og av RLS-policy på write.
 */
async function fetchBingoBangoBongoHoles(
  gameId: string,
): Promise<BingoBangoBongoHoleInput[]> {
  const supabase = getAdminClient();
  const { data, error } = await supabase
    .from('bingo_bango_bongo_holes')
    .select('hole_number, bingo_user_id, bango_user_id, bongo_user_id')
    .eq('game_id', gameId)
    .order('hole_number', { ascending: true });

  if (error) {
    console.error('[getBingoBangoBongoHoles] query failed', { gameId, error });
    throw new Error('Failed to fetch bingo bango bongo holes');
  }

  return (data ?? []).map((row) => ({
    holeNumber: row.hole_number,
    bingoUserId: row.bingo_user_id,
    bangoUserId: row.bango_user_id,
    bongoUserId: row.bongo_user_id,
  }));
}

export async function getBingoBangoBongoHoles(
  gameId: string,
): Promise<BingoBangoBongoHoleInput[]> {
  return unstable_cache(
    () => fetchBingoBangoBongoHoles(gameId),
    ['bbb-holes', gameId],
    { tags: [`game-${gameId}`], revalidate: 900 },
  )();
}
