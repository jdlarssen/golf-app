import 'server-only';
import { unstable_cache } from 'next/cache';
import { getAdminClient } from '@/lib/supabase/admin';
import type { BingoBangoBongoHoleInput } from '@/lib/scoring/modes/types';

const BBB_HOLES_SELECT = 'hole_number, bingo_user_id, bango_user_id, bongo_user_id';

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
    .select(BBB_HOLES_SELECT)
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
    // The select string is in the key (#2224), so a select change gives a new
    // entry by itself. The cache holds the mapped `BingoBangoBongoHoleInput`
    // shape, though: change only the mapping above and the key must still be
    // bumped by hand.
    ['bbb-holes', BBB_HOLES_SELECT, gameId],
    { tags: [`game-${gameId}`], revalidate: 900 },
  )();
}
