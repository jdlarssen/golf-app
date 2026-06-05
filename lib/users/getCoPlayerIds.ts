import 'server-only';
import { getAdminClient } from '@/lib/supabase/admin';

/**
 * Bruker-ider du har delt minst ett spill med (co-players via felles
 * `game_players`). Trukket ut av `getTeamCandidates` (#362) så både lag-
 * påmeldings-autocomplete og venne-forslag (#369) leser samme kilde.
 *
 * Best-effort: ved query-feil returneres tom liste.
 */
export async function getCoPlayerIds(userId: string): Promise<string[]> {
  const admin = getAdminClient();

  const { data: myGames, error: myGamesError } = await admin
    .from('game_players')
    .select('game_id')
    .eq('user_id', userId)
    .returns<{ game_id: string }[]>();
  if (myGamesError || !myGames || myGames.length === 0) {
    if (myGamesError) {
      console.error('[getCoPlayerIds] my games lookup failed', myGamesError);
    }
    return [];
  }
  const gameIds = [...new Set(myGames.map((g) => g.game_id))];

  const { data: coRows, error: coError } = await admin
    .from('game_players')
    .select('user_id')
    .in('game_id', gameIds)
    .neq('user_id', userId)
    .returns<{ user_id: string }[]>();
  if (coError || !coRows) {
    if (coError) {
      console.error('[getCoPlayerIds] co-player lookup failed', coError);
    }
    return [];
  }
  return [...new Set(coRows.map((r) => r.user_id))];
}
