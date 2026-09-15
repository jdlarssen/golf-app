import { getBrowserClient } from '@/lib/supabase/client';
import type { BingoBangoBongoHoleInput } from '@/lib/scoring/modes/types';

/**
 * Read this game's Bingo Bango Bongo rows from the browser (#1950).
 *
 * The hole screen re-reads after every realtime event instead of trusting the
 * payload, because events can arrive out of order. Goes straight to PostgREST
 * rather than the cached server read (`getBingoBangoBongoHoles`), whose first
 * answer after a write can be stale. RLS (`bbb_holes_read`) limits the rows to
 * games the viewer plays in, and the hole page is player-only.
 *
 * Throws on a query error: an error is not an empty list, and applying `[]`
 * would wipe every category on screen.
 */
export async function readBingoBangoBongoHoles(
  gameId: string,
): Promise<BingoBangoBongoHoleInput[]> {
  const supabase = getBrowserClient();
  const { data, error } = await supabase
    .from('bingo_bango_bongo_holes')
    .select('hole_number, bingo_user_id, bango_user_id, bongo_user_id')
    .eq('game_id', gameId)
    .order('hole_number', { ascending: true });

  if (error) {
    throw new Error(
      `Failed to read Bingo Bango Bongo holes: ${error.message}`,
    );
  }

  return (data ?? []).map((row) => ({
    holeNumber: row.hole_number,
    bingoUserId: row.bingo_user_id,
    bangoUserId: row.bango_user_id,
    bongoUserId: row.bongo_user_id,
  }));
}
