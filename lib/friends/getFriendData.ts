import 'server-only';
import { getAdminClient } from '@/lib/supabase/admin';
import { getCoPlayerIds } from '@/lib/users/getCoPlayerIds';
import {
  partitionFriendships,
  suggestionIds,
  type FriendshipRow,
} from './friendGraph';

export type FriendUser = {
  id: string;
  name: string | null;
  nickname: string | null;
  email: string;
};

export type FriendRequestRow = {
  /** friendships.id — brukes til godta/avslå/trekk. */
  id: string;
  user: FriendUser;
};

export type FriendData = {
  friends: FriendUser[];
  /** Innkommende forespørsler (krever svar). */
  incoming: FriendRequestRow[];
  /** Utgående forespørsler (venter på svar). */
  outgoing: FriendRequestRow[];
  /** Co-player-forslag som ikke allerede er venn/forespurt. */
  suggestions: FriendUser[];
};

/**
 * All venne-data for `/profile/venner`: aksepterte venner, innkommende +
 * utgående forespørsler, og co-player-forslag. Navn hentes via admin-client
 * (users-RLS-gap, samme mønster som `getClubDetail`). Best-effort.
 */
export async function getFriendData(userId: string): Promise<FriendData> {
  const admin = getAdminClient();

  const { data: rows, error } = await admin
    .from('friendships')
    .select('id, requester_id, addressee_id, status')
    .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)
    .returns<FriendshipRow[]>();
  if (error) console.error('[getFriendData] friendships lookup failed', error);

  const { friends, incoming, outgoing, relatedIds } = partitionFriendships(
    rows ?? [],
    userId,
  );

  const coPlayerIds = await getCoPlayerIds(userId);
  const suggestion = suggestionIds(coPlayerIds, relatedIds, userId);

  const allIds = [...new Set([...relatedIds, ...suggestion])];
  const byId = new Map<string, FriendUser>();
  if (allIds.length > 0) {
    const { data: users, error: usersError } = await admin
      .from('users')
      .select('id, name, nickname, email')
      .in('id', allIds)
      .returns<FriendUser[]>();
    if (usersError) console.error('[getFriendData] user lookup failed', usersError);
    for (const u of users ?? []) byId.set(u.id, u);
  }

  const sortByName = (a: FriendUser, b: FriendUser) =>
    (a.name ?? a.email).localeCompare(b.name ?? b.email, 'nb');

  const resolve = (otherId: string): FriendUser | null => byId.get(otherId) ?? null;
  const withUser = (m: { id: string; otherId: string }): FriendRequestRow | null => {
    const user = resolve(m.otherId);
    return user ? { id: m.id, user } : null;
  };

  return {
    friends: friends
      .map((m) => resolve(m.otherId))
      .filter((u): u is FriendUser => u !== null)
      .sort(sortByName),
    incoming: incoming
      .map(withUser)
      .filter((r): r is FriendRequestRow => r !== null),
    outgoing: outgoing
      .map(withUser)
      .filter((r): r is FriendRequestRow => r !== null),
    suggestions: suggestion
      .map(resolve)
      .filter((u): u is FriendUser => u !== null && Boolean(u.email))
      .sort(sortByName),
  };
}
