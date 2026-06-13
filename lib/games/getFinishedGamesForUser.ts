import type { SupabaseClient } from '@supabase/supabase-js';
import type { GameMode, GameModeConfig } from '@/lib/scoring/modes/types';
import { byEndedAtDesc } from './finishedOrder';

/**
 * A finished game as shown on the home «Avsluttede spill» list and the
 * /spill-arkiv page. Slim projection — only the columns `FinishedGameCard`
 * renders (name, course, variant-aware format label, end date).
 */
export type FinishedGame = {
  id: string;
  name: string;
  ended_at: string | null;
  game_mode: GameMode;
  mode_config: GameModeConfig;
  courses: { name: string } | null;
};

type FinishedRow = {
  games: FinishedGame | null;
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
 * Uses the passed RLS-respecting cookie client: a player sees their own
 * finished games via `game_players` membership + the finished-visibility policy.
 */
export async function getFinishedGamesForUser(
  supabase: SupabaseClient,
  userId: string,
): Promise<FinishedGame[]> {
  const { data } = await supabase
    .from('game_players')
    .select(
      'games!inner(id, name, ended_at, game_mode, mode_config, courses(name))',
    )
    .eq('user_id', userId)
    .eq('games.status', 'finished')
    .returns<FinishedRow[]>();

  return (data ?? [])
    .map((row) => row.games)
    .filter((g): g is FinishedGame => g != null)
    .sort(byEndedAtDesc);
}
