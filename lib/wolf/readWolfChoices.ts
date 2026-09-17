import { getBrowserClient } from '@/lib/supabase/client';
import type { WolfChoice, WolfHoleChoice } from '@/lib/scoring/modes/types';

/**
 * Read this game's Wolf choices from the browser (#2092).
 *
 * The hole screen re-reads after every realtime event instead of trusting the
 * payload, because events can arrive out of order. Goes straight to PostgREST
 * rather than the cached server read (`getWolfChoices`), whose first answer
 * after a write can be stale. RLS (`wolf_choices_read`) limits the rows to
 * games the viewer plays in, and the hole page is player-only.
 *
 * Throws on a query error: an error is not an empty list, and applying `[]`
 * would wipe every choice on screen.
 */
export async function readWolfChoices(
  gameId: string,
): Promise<WolfHoleChoice[]> {
  const supabase = getBrowserClient();
  const { data, error } = await supabase
    .from('wolf_hole_choices')
    .select('hole_number, wolf_user_id, choice, partner_user_id')
    .eq('game_id', gameId)
    .order('hole_number', { ascending: true });

  if (error) {
    throw new Error(`Failed to read Wolf choices: ${error.message}`);
  }

  return (data ?? []).map((row) => ({
    holeNumber: row.hole_number,
    wolfUserId: row.wolf_user_id,
    choice: row.choice as WolfChoice,
    partnerUserId: row.partner_user_id,
  }));
}
