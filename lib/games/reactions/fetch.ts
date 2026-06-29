import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { aggregateReactions, type ReactionSummary } from './aggregate';

/**
 * Fetch all reactions for a game and aggregate them into a per-target summary.
 *
 * Thin DB wrapper — no caching. Called in parallel with the cached
 * `getGameWithPlayers` in leaderboard/page.tsx (same pattern as uncached
 * courses/tee_box joins). RLS enforces participant-only read access.
 *
 * @param supabase  User-scoped server client (RLS-enforced).
 * @param gameId    The game to load reactions for.
 * @param myUserId  The current viewer's user id (used to populate `mine`).
 */
export async function fetchGameReactions(
  supabase: SupabaseClient<Database>,
  gameId: string,
  myUserId: string,
): Promise<ReactionSummary> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('reactions')
    .select('target_user_id, emoji, user_id')
    .eq('game_id', gameId);

  if (error) {
    // Non-fatal: reaction data is cosmetic. Log and return empty rather than
    // crashing the leaderboard page.
    console.error('[fetchGameReactions] select failed', error);
    return {};
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return aggregateReactions((data as any[]) ?? [], myUserId);
}
