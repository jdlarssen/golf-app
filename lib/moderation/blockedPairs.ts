import 'server-only';
import { getAdminClient } from '@/lib/supabase/admin';

/**
 * #3019: the ids `userId` has a block with, in either direction. The TS twin
 * of `public.is_blocked_between` (0259), for the places that build a list
 * rather than check one pair: the invite set, the cup's candidates and the
 * terminliste.
 *
 * Service role, because the blocked person cannot read the blocker's row.
 * Throws on a read error: the callers decide whether to fail closed (refuse
 * the add) or open (show the list unfiltered, the database still refuses).
 */
export async function getBlockedPairIds(userId: string): Promise<Set<string>> {
  const { data, error } = await getAdminClient()
    .from('user_blocks')
    .select('blocker_id, blocked_id')
    .or(`blocker_id.eq.${userId},blocked_id.eq.${userId}`)
    .returns<{ blocker_id: string; blocked_id: string }[]>();
  if (error) throw new Error(`getBlockedPairIds: ${error.message}`);
  return new Set(
    (data ?? []).map((row) => (row.blocker_id === userId ? row.blocked_id : row.blocker_id)),
  );
}
