import 'server-only';
import { getAdminClient } from '@/lib/supabase/admin';

/**
 * Slim count of incoming (pending, addressed-to-me) friend requests — for the
 * profile «Venner»-card badge (#870). Deliberately NOT the full `getFriendData`
 * fan-out (which also resolves co-players + every related user's name); the
 * badge only needs a number. Admin client matches `getFriendData`'s users-RLS-
 * gap pattern; this reads `friendships` only and returns a count, no PII.
 * Best-effort → 0 on error (the badge simply doesn't show).
 */
export async function getIncomingFriendRequestCount(
  userId: string,
): Promise<number> {
  const admin = getAdminClient();
  const { count, error } = await admin
    .from('friendships')
    .select('id', { count: 'exact', head: true })
    .eq('addressee_id', userId)
    .eq('status', 'pending');
  if (error) {
    console.error('[getIncomingFriendRequestCount] failed', error);
    return 0;
  }
  return count ?? 0;
}
