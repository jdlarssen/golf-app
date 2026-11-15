import 'server-only';
import { getAdminClient } from '@/lib/supabase/admin';
import { selectAllRows } from '@/lib/supabase/selectAllRows';
import { chunkIds } from '@/lib/notifications/inboxReads';
import { formatDisplayLabel } from '@/lib/games/formatLabel';
import { expectedTeamSize } from '@/lib/games/teamScope';
import type { GameMode, GameModeConfig } from '@/lib/scoring/modes/types';
import type { ResultSummary } from '@/lib/scoring/resultSummary';
import { CO_PLAYER_GAME_CHUNK, readMyFinishedGames } from './getFriendStats';
import { playedAt, sortByLastPlayed } from './friendStats';
import { roundBadge, type RoundBadge } from './headToHead';

/** One round you and a friend played, as the app's friend page lists it. */
export type SharedRound = {
  gameId: string;
  name: string;
  /** Planned tee-off, else the end (`playedAt`), as «N runder sammen» dates it. */
  playedAt: string | null;
  modeLabel: string;
  badge: RoundBadge | null;
};

type MyRoundRow = {
  game_id: string;
  team_number: number | null;
  result_summary: ResultSummary | null;
  games: {
    id: string;
    name: string;
    scheduled_tee_off_at: string | null;
    ended_at: string | null;
    game_mode: GameMode;
    mode_config: GameModeConfig;
    league_round_id: string | null;
  } | null;
};

type TheirRoundRow = { game_id: string; team_number: number | null; result_summary: ResultSummary | null };

/**
 * The rounds `userId` and `otherId` played together (#2381), newest first,
 * each with how the two of you did against each other.
 *
 * The same rounds «N runder sammen» counts (`readMyFinishedGames`, and the
 * other player not withdrawn), so `rounds.length` is that number. Admin
 * client, because the other player's row is not always readable to you. The
 * caller must have checked that the two are friends: this reads another
 * player's `team_number` and `result_summary`, and only the badge leaves.
 *
 * Throws on a query error, so a failed read never looks like «no rounds».
 */
export async function getSharedRounds(userId: string, otherId: string): Promise<SharedRound[]> {
  const mine = await readMyFinishedGames<MyRoundRow>(
    userId,
    'game_id, team_number, result_summary, games!inner(id, name, scheduled_tee_off_at, ended_at, game_mode, mode_config, league_round_id)',
    'getSharedRounds my games',
  );
  const games = mine.filter((row) => row.games != null);
  if (games.length === 0) return [];

  const admin = getAdminClient();
  const pages = await Promise.all(
    chunkIds(
      games.map((row) => row.game_id),
      CO_PLAYER_GAME_CHUNK,
    ).map((slice) =>
      selectAllRows(
        (from, to) =>
          admin
            .from('game_players')
            .select('game_id, team_number, result_summary')
            .eq('user_id', otherId)
            .in('game_id', slice)
            .is('withdrawn_at', null)
            .order('game_id')
            .range(from, to)
            .overrideTypes<TheirRoundRow[], { merge: false }>(),
        'getSharedRounds their rows',
      ),
    ),
  );
  const theirs = new Map(pages.flat().map((row) => [row.game_id, row]));

  const rounds: SharedRound[] = [];
  for (const row of games) {
    const other = theirs.get(row.game_id);
    if (!other) continue;
    const g = row.games!;
    rounds.push({
      gameId: g.id,
      name: g.name,
      playedAt: playedAt({ scheduledTeeOffAt: g.scheduled_tee_off_at, endedAt: g.ended_at }),
      modeLabel: formatDisplayLabel(g.game_mode, g.mode_config),
      badge: roundBadge({
        gameMode: g.game_mode,
        teamSize: expectedTeamSize(g.mode_config),
        leagueFlight: g.league_round_id != null,
        me: { teamNumber: row.team_number, summary: row.result_summary },
        them: { teamNumber: other.team_number, summary: other.result_summary },
      }),
    });
  }
  return sortByLastPlayed(rounds, (r) => r.playedAt);
}
