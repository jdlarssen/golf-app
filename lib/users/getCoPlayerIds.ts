import 'server-only';
import { getAdminClient } from '@/lib/supabase/admin';
import { selectAllRowsResult } from '@/lib/supabase/selectAllRows';
import { chunkIds } from '@/lib/notifications/inboxReads';
import type { GameStatus } from '@/lib/games/status';

/**
 * Bruker-ider du har delt minst ett spill med som du kan se (co-players via
 * felles `game_players`). Trukket ut av `getTeamCandidates` (#362) så både lag-
 * påmeldings-autocomplete og venne-forslag (#369) leser samme kilde.
 *
 * #2445: et utkast teller bare for arrangøren. Står du på andres utkast, gjør
 * det deg ikke til medspiller av de andre på lista. Speiler medspiller-grenen i
 * `is_invite_eligible` (migrasjon 0202); endre begge sammen.
 *
 * Best-effort: ved query-feil returneres tom liste.
 */
export async function getCoPlayerIds(userId: string): Promise<string[]> {
  const admin = getAdminClient();

  const { data: myGames, error: myGamesError } = await admin
    .from('game_players')
    .select('game_id, games!inner(status, created_by)')
    .eq('user_id', userId)
    .returns<
      { game_id: string; games: { status: GameStatus; created_by: string | null } }[]
    >();
  if (myGamesError || !myGames || myGames.length === 0) {
    if (myGamesError) {
      console.error('[getCoPlayerIds] my games lookup failed', myGamesError);
    }
    return [];
  }
  const gameIds = [
    ...new Set(
      myGames
        // #2445: someone else's draft makes no co-players (is_invite_eligible).
        .filter((g) => !(g.games.status === 'draft' && g.games.created_by !== userId))
        .map((g) => g.game_id),
    ),
  ];
  if (gameIds.length === 0) return [];

  // #2267: the games in slices, since a club-scale player passes the `.in()`
  // URL limit. A failed slice gives an empty list, as a failed read did.
  const results = await Promise.all(
    chunkIds(gameIds).map((slice) =>
      selectAllRowsResult(
        (from, to) =>
          admin
            .from('game_players')
            .select('user_id')
            .in('game_id', slice)
            .neq('user_id', userId)
            .order('game_id')
            .order('user_id')
            .range(from, to)
            .returns<{ user_id: string }[]>(),
        'getCoPlayerIds co-players',
      ),
    ),
  );
  const ids = new Set<string>();
  for (const { data, error } of results) {
    if (error || !data) {
      if (error) console.error('[getCoPlayerIds] co-player lookup failed', error);
      return [];
    }
    for (const r of data) ids.add(r.user_id);
  }
  return [...ids];
}
