import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { expireGameCache } from './expireGameCache';

/**
 * Audit 2026-11-20: a course edit expires the cached game of every round on
 * that course. `getGameWithPlayers` caches the game with its tee's ratings and
 * par for 15 minutes, so without this a changed tee showed its old numbers on
 * the game pages until the cache ran out.
 *
 * Only rounds that are not finished: a finished round's numbers are frozen,
 * and the filter keeps the read well under PostgREST's 1 000-row cap.
 *
 * Best effort: the course save has already landed when this runs, so a failed
 * read is logged and the cache runs out on its own (15 min), as before.
 */
export async function expireCourseGameCaches(
  client: SupabaseClient<Database>,
  courseId: string,
): Promise<void> {
  const { data, error } = await client
    .from('games')
    .select('id')
    .eq('course_id', courseId)
    .in('status', ['draft', 'scheduled', 'active'])
    .returns<{ id: string }[]>();
  if (error) {
    console.error('[expireCourseGameCaches] games read failed', { courseId, error });
    return;
  }
  for (const { id } of data ?? []) expireGameCache(id);
}
