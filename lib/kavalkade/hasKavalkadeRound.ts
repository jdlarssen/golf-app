import 'server-only';

/**
 * Har spilleren noe å se i Kavalkaden? (#2131, K5)
 *
 * Teaseren og lenken på forsiden vises bare for dem som har minst én ferdig
 * runde i året — en spiller uten runder ville fått en teaser som ledet til en
 * tom kortstokk.
 *
 * Spørringen er den samme avgrensningen som `loadKavalkadeInput` bruker for
 * spillerens egne runder — ferdig, ikke trukket, ikke avledet, avsluttet
 * innenfor året fram til frysegrensen — bare uten radene. Vinduet kommer fra
 * `windowStart` der, så nyttårs-slingringen har fortsatt ett hjem.
 *
 * Leses med sesjons-klienten: RLS gir spilleren bare hens egne `game_players`,
 * som er nøyaktig det vi spør om. Feiler lesingen, svarer vi `false` — en
 * teaser er ikke verdt en feilside på forsiden.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { effectiveYear } from '@/lib/stats/effectiveDate';
import { windowStart } from './loadKavalkadeInput';
import { KAVALKADE_CUTOFF, KAVALKADE_YEAR } from './release';

export async function hasFinishedRoundInKavalkadeYear(
  supabase: SupabaseClient<Database>,
  userId: string,
  year: number = KAVALKADE_YEAR,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('game_players')
    .select('games!inner(scheduled_tee_off_at, ended_at)')
    .eq('user_id', userId)
    .is('withdrawn_at', null)
    .eq('games.status', 'finished')
    .is('games.source_game_id', null)
    .gte('games.ended_at', windowStart(year).toISOString())
    .lt('games.ended_at', KAVALKADE_CUTOFF.toISOString())
    .returns<{ games: { scheduled_tee_off_at: string | null; ended_at: string | null } }[]>();

  if (error) {
    console.error('[kavalkade] kunne ikke telle årets runder', error);
    return false;
  }

  // Slingringsmonnet rundt nyttår henter med runder som kan høre til
  // nabo-året; `effectiveYear` avgjør hvilket år runden faktisk teller i,
  // akkurat som i fakta-byggeren.
  return (data ?? []).some((row) => effectiveYear(row.games) === year);
}
