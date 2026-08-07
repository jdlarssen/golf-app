import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import type { GameMode, GameModeConfig } from '@/lib/scoring/modes/types';
import type { HoleSegment } from '@/lib/scoring';
import type { ResultSummary } from '@/lib/scoring/resultSummary';
import { byEndedAtDesc } from './finishedOrder';

/**
 * The persisted cup outcome the finished cup-day badge reads (#1449, owner
 * decision 4). Never recomputed — `winner_team`/`status` are stored truth on
 * `tournaments`; the badge only maps them to «vant/tapte/delt».
 */
export type FinishedTournament = {
  name: string;
  status: string;
  winner_team: number | null;
  team_1_name: string;
  team_2_name: string;
};

/**
 * A finished game as shown on the home «Avsluttede spill» list and the
 * /spill-arkiv page. Slim projection — only the columns `FinishedGameCard`
 * renders (name, course, variant-aware format label, end date) plus the
 * viewer's own per-player result (#572).
 */
export type FinishedGame = {
  id: string;
  name: string;
  ended_at: string | null;
  game_mode: GameMode;
  mode_config: GameModeConfig;
  courses: { name: string } | null;
  /**
   * The viewer's own outcome for this game (#572). Read from THIS user's
   * `game_players` row, so the card shows «🥇 Du vant» / «2. plass av 4» etc.
   * `null` for games finished before the feature shipped → 🏆-fallback.
   */
  result_summary: ResultSummary | null;
  /**
   * #1449: split-day cup fields. `tournament_id` + `hole_segment` let the
   * caller pair the two host halves of one cup day into a single cup-branded
   * card. `team_number` is the viewer's own cup side (1|2) read from their
   * `game_players` row — the slim roster source, never a recomputed snapshot.
   * `tournament` carries the persisted cup outcome for the badge.
   */
  tournament_id: string | null;
  hole_segment: HoleSegment;
  team_number: number | null;
  tournament: FinishedTournament | null;
};

type FinishedRow = {
  result_summary: ResultSummary | null;
  team_number: number | null;
  games:
    | (Omit<FinishedGame, 'result_summary' | 'team_number'> & {
        tournament: FinishedTournament | null;
      })
    | null;
};

/**
 * All of `userId`'s finished games, newest `ended_at` first.
 *
 * Single source of truth for "my finished games" — used by both `HomeBody`
 * (sliced to the latest 5) and the `/spill-arkiv` page (all, grouped by month),
 * so the two surfaces can never drift on what counts as finished or in which
 * order. Sorted in JS via `byEndedAtDesc` because supabase-js' foreignTable-
 * order is a no-op for to-one embeds like `games!inner(...)` (#569).
 *
 * `result_summary` (#572) is read from THIS user's own `game_players` row
 * (the query root), so each card shows the viewer's personal outcome.
 *
 * Uses the passed RLS-respecting cookie client: a player sees their own
 * finished games via `game_players` membership + the finished-visibility policy.
 */
export async function getFinishedGamesForUser(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<FinishedGame[]> {
  const { data, error } = await supabase
    .from('game_players')
    .select(
      'result_summary, team_number, games!inner(id, name, ended_at, game_mode, mode_config, hole_segment, tournament_id, courses(name), tournament:tournaments(name, status, winner_team, team_1_name, team_2_name))',
    )
    .eq('user_id', userId)
    .eq('games.status', 'finished')
    // #1449: derived cup games (singles) carry `source_game_id` and must never
    // render as their own finished card — the host halves are the cards.
    .is('games.source_game_id', null)
    .returns<FinishedRow[]>();

  // #877: a swallowed error returned `[]`, which on Home computed as
  // `isEmptyState` and rendered the «start here» welcome — hiding the user's
  // games. Throw so the locale `error.tsx` shows an honest retry screen
  // (covers both Home and /spill-arkiv, which share this helper).
  if (error) throw error;

  return (data ?? [])
    .filter((row): row is FinishedRow & { games: NonNullable<FinishedRow['games']> } =>
      row.games != null,
    )
    .map((row) => ({
      ...row.games,
      result_summary: row.result_summary,
      team_number: row.team_number,
    }))
    .sort(byEndedAtDesc);
}
