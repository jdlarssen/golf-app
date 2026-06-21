import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import type { GameMode, GameModeConfig } from '@/lib/scoring/modes/types';
import type { ResultSummary } from '@/lib/scoring/resultSummary';
import { byEndedAtDesc } from './finishedOrder';

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
};

type FinishedRow = {
  result_summary: ResultSummary | null;
  games: Omit<FinishedGame, 'result_summary'> | null;
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
  const { data } = await supabase
    .from('game_players')
    .select(
      'result_summary, games!inner(id, name, ended_at, game_mode, mode_config, courses(name))',
    )
    .eq('user_id', userId)
    .eq('games.status', 'finished')
    .returns<FinishedRow[]>();

  return (data ?? [])
    .filter((row): row is FinishedRow & { games: NonNullable<FinishedRow['games']> } =>
      row.games != null,
    )
    .map((row) => ({ ...row.games, result_summary: row.result_summary }))
    .sort(byEndedAtDesc);
}
