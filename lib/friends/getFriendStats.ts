import 'server-only';
import { getAdminClient } from '@/lib/supabase/admin';
import { selectAllRows } from '@/lib/supabase/selectAllRows';
import { chunkIds } from '@/lib/notifications/inboxReads';
import { friendStatsFromRows, type FriendStats, type SharedGame } from './friendStats';

/**
 * Games per co-player read (#2267). That read carries two `.in()` lists in one
 * URL, the games and the other players (`IN_CHUNK`, 100), so the games go in
 * smaller slices: at most 150 uuids per request, under the 200 measured to
 * work (#2214: 200 ok, 400 fails).
 */
const CO_PLAYER_GAME_CHUNK = 50;

type MyGameRow = {
  game_id: string;
  games: { id: string; name: string; scheduled_tee_off_at: string | null; ended_at: string | null } | null;
};

/**
 * Shared rounds between `userId` and each of `otherIds` (#2256), for the app's
 * friends screen. Admin client, because `game_players` of a game you share
 * with a pending request or a suggestion is not always readable to you, the
 * same reason `getCoPlayerIds` reads with it. Only counts, dates and game
 * names leave: never another player's row.
 *
 * A player who withdrew from a game was not in it (#2267): neither your own
 * row nor theirs counts once `withdrawn_at` is set.
 *
 * Throws on a query error, so a failed read never looks like «no rounds».
 */
export async function getFriendStats(
  userId: string,
  otherIds: readonly string[],
): Promise<Map<string, FriendStats>> {
  const ids = [...new Set(otherIds)];
  if (ids.length === 0) return new Map();
  const admin = getAdminClient();

  // Finished, non-derived: the rule `getFinishedGamesForUser` uses (#1449).
  const mine = await selectAllRows(
    (from, to) =>
      admin
        .from('game_players')
        .select('game_id, games!inner(id, name, scheduled_tee_off_at, ended_at)')
        .eq('user_id', userId)
        .is('withdrawn_at', null)
        .eq('games.status', 'finished')
        .is('games.source_game_id', null)
        .order('game_id')
        .range(from, to)
        .returns<MyGameRow[]>(),
    'getFriendStats my games',
  );
  const games: SharedGame[] = mine
    .filter((row) => row.games != null)
    .map(({ games: g }) => ({
      id: g!.id,
      name: g!.name,
      scheduledTeeOffAt: g!.scheduled_tee_off_at,
      endedAt: g!.ended_at,
    }));
  if (games.length === 0) return new Map();

  // Each slice of games × each slice of the others, merged before counting.
  const slices = chunkIds(
    games.map((g) => g.id),
    CO_PLAYER_GAME_CHUNK,
  ).flatMap((gameSlice) => chunkIds(ids).map((idSlice) => [gameSlice, idSlice] as const));
  const pages = await Promise.all(
    slices.map(([gameSlice, idSlice]) =>
      selectAllRows(
        (from, to) =>
          admin
            .from('game_players')
            .select('game_id, user_id')
            .in('game_id', gameSlice)
            .in('user_id', idSlice)
            .is('withdrawn_at', null)
            .order('game_id')
            .order('user_id')
            .range(from, to)
            .returns<{ game_id: string; user_id: string }[]>(),
        'getFriendStats co-players',
      ),
    ),
  );
  const rows = pages.flat();
  return friendStatsFromRows(games, rows);
}

/**
 * Handicap index of each friend with a finished profile (#2256). An
 * unfinished profile still holds the sign-up default, which is no handicap
 * to show. Throws on a query error.
 */
export async function getFriendHandicaps(
  friendIds: readonly string[],
): Promise<Map<string, number>> {
  const ids = [...new Set(friendIds)];
  if (ids.length === 0) return new Map();
  const { data, error } = await getAdminClient()
    .from('users')
    .select('id, hcp_index, profile_completed_at')
    .in('id', ids)
    .returns<{ id: string; hcp_index: number | string; profile_completed_at: string | null }[]>();
  if (error) throw error;
  return new Map(
    (data ?? [])
      .filter((u) => u.profile_completed_at !== null)
      .map((u) => [u.id, Number(u.hcp_index)]),
  );
}
