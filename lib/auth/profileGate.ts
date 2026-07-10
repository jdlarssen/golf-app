import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';

/**
 * #1176 profile gate. Returns true when the user has NOT finished onboarding
 * (`profile_completed_at IS NULL`).
 *
 * The auth trigger pre-creates a placeholder `public.users` row, so "a row
 * exists" is never enough — the completion timestamp is the real signal (same
 * rule the `/`, `/profile` and `/signup` gates use). Runs as a slim query on the
 * request-scoped client (RLS grants read on the caller's own row); the cached
 * `getGameWithPlayers` select deliberately omits this column, so scoring
 * surfaces check it directly here.
 */
export async function isProfileIncomplete(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from('users')
    .select('profile_completed_at')
    .eq('id', userId)
    .maybeSingle<{ profile_completed_at: string | null }>();
  return !data?.profile_completed_at;
}
