import { cache } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { getServerClient } from '@/lib/supabase/server';
import { getProxyVerifiedUserId } from '@/lib/auth/userId';
import type { SideWinnerRow } from './leaderboardTypes';

// Request-scoped Supabase client + verified user id. Shared by every
// Suspense body in this route so we don't pay a cookie-auth round-trip
// per section. Defined once here (#682) so every leaderboard render module
// imports the SAME cached function reference — `cache()` only dedups across
// callers that share the reference.
export const getLeaderboardContext = cache(async () => {
  const supabase = await getServerClient();
  const userId = await getProxyVerifiedUserId();
  return { supabase, userId };
});

/**
 * Henter LD/CTP-vinnerne for et spill. Trukket ut (#682) så best-ball-finish-
 * stien (`LeaderboardBody`) og `computeSideTournament` deler ETT spørringssted
 * i stedet for to identiske `game_side_winners`-queries. RLS slipper kun
 * spillere gjennom når status=finished, som begge kall-stedene allerede har
 * bekreftet via view-branching.
 *
 * Accepts any `SupabaseClient<Database>` — both the cookie-based server client
 * and the service-role admin client (#938 spectate route) satisfy this type.
 */
export async function fetchSideWinners(
  supabase: SupabaseClient<Database>,
  gameId: string,
): Promise<SideWinnerRow[]> {
  const sideWinnersRes = await supabase
    .from('game_side_winners')
    .select('category, position, winner_user_id')
    .eq('game_id', gameId)
    .order('category')
    .order('position')
    .returns<SideWinnerRow[]>();
  if (sideWinnersRes.error) throw sideWinnersRes.error;
  return sideWinnersRes.data ?? [];
}
