import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { onlyStandaloneGames } from './arrangedGames';

/**
 * Whether you made any standalone round (#2494): the quick read the Klubbhus
 * room uses to tell a new player. The same games as `getArrangedRounds` (your
 * own, no cup match or league flight, every status), but one row is enough, so
 * the choice does not wait for rosters and start blocks. Request client and
 * RLS: these are your own rows. A failed read is `ok: false`, never «none».
 */
export async function readAnyOwnStandaloneRound(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<{ ok: true; games: { id: string }[] } | { ok: false }> {
  const { data, error } = await onlyStandaloneGames(
    supabase.from('games').select('id').eq('created_by', userId),
  ).limit(1);
  if (error) {
    console.error('[readAnyOwnStandaloneRound]', error);
    return { ok: false };
  }
  return { ok: true, games: data ?? [] };
}
