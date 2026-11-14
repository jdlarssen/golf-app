// native/app/src/lib/friendRelation.ts
// #2878: hvordan en annen spiller står til deg, regnet av lista appen alt
// henter (`fetchFriends`). Ren funksjon: ligaarket spør den, og serveren
// leses ikke på nytt for forholdet.
import type { FriendItem, FriendPerson, FriendRequestItem, FriendsData } from '../data/friends';

export type FriendRelation =
  | { kind: 'friend'; person: FriendItem }
  | { kind: 'incoming'; requestId: string; person: FriendRequestItem }
  | { kind: 'outgoing'; person: FriendRequestItem }
  /** `person` er treffet i forslagene (medspillere), eller `null` når personen ikke står noe sted. */
  | { kind: 'none'; person: FriendPerson | null };

/**
 * Forholdet til `userId`. Står id-en i flere lister (det skal ikke skje),
 * vinner venn, så innkommende, så utgående.
 */
export function friendRelationFor(data: FriendsData, userId: string): FriendRelation {
  const friend = data.friends.find((f) => f.id === userId);
  if (friend) return { kind: 'friend', person: friend };
  const incoming = data.incoming.find((r) => r.id === userId);
  if (incoming) return { kind: 'incoming', requestId: incoming.requestId, person: incoming };
  const outgoing = data.outgoing.find((r) => r.id === userId);
  if (outgoing) return { kind: 'outgoing', person: outgoing };
  return { kind: 'none', person: data.suggestions.find((s) => s.id === userId) ?? null };
}
