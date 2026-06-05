import 'server-only';
import { getAdminClient } from '@/lib/supabase/admin';
import { friendIdsFromRows, type FriendshipRow } from './friendGraph';

/**
 * Aksepterte venners bruker-ider for `userId` (begge retninger). Brukes av
 * discovery («Fra vennene dine»), skip-gate-sjekken i signup, og lag-
 * påmeldings-resolveren. Admin-client (RLS-bypass) med eksplisitt userId-filter.
 *
 * Best-effort: ved query-feil returneres tom liste.
 */
export async function getFriendIds(userId: string): Promise<string[]> {
  const admin = getAdminClient();
  const { data, error } = await admin
    .from('friendships')
    .select('id, requester_id, addressee_id, status')
    .eq('status', 'accepted')
    .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)
    .returns<FriendshipRow[]>();
  if (error || !data) {
    if (error) console.error('[getFriendIds] lookup failed', error);
    return [];
  }
  return friendIdsFromRows(data, userId);
}
