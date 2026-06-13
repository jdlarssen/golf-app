import 'server-only';
import { getAdminClient } from '@/lib/supabase/admin';
import { connectedIdsFromRows, type FriendshipRow } from './friendGraph';

/**
 * Bruker-ider for alle venne-relasjoner til `userId` — aksepterte OG pending,
 * begge retninger. Picker-kilden i opprett-veiviseren bruker denne (ikke
 * `getFriendIds`, som er accepted-only) så folk du har sendt eller mottatt en
 * venneforespørsel til kan velges i et spill før forespørselen er besvart.
 * Admin-client (RLS-bypass) med eksplisitt userId-filter.
 *
 * Best-effort: ved query-feil returneres tom liste.
 */
export async function getFriendConnectionIds(userId: string): Promise<string[]> {
  const admin = getAdminClient();
  const { data, error } = await admin
    .from('friendships')
    .select('id, requester_id, addressee_id, status')
    .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)
    .returns<FriendshipRow[]>();
  if (error || !data) {
    if (error) console.error('[getFriendConnectionIds] lookup failed', error);
    return [];
  }
  return connectedIdsFromRows(data, userId);
}
