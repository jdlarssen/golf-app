import 'server-only';
import { getFriendData, type FriendUser } from './getFriendData';
import {
  sortByLastPlayed,
  sortByRoundsTogether,
  visibleFriendHcp,
  type FriendStats,
} from './friendStats';
import { getFriendHandicaps, getFriendStats } from './getFriendStats';
import { displayNameForOthers } from '@/lib/users/displayName';
import { nameInitials } from '@/lib/names/initials';
import {
  getPrivateUserFields,
  type PrivateUserFields,
} from '@/lib/users/privateUserFields';

/**
 * One person on the friends page. `name` is what others see (name with
 * nickname, else the masked address, #2207/#2271); `initials` come from the
 * plain name, so a nickname never ends up in the avatar («KN», not «K«»).
 */
export type Person = { id: string; name: string; initials: string; stats: FriendStats | null };
/** `hcp` only after a finished round together (`visibleFriendHcp`, #2267). */
export type Friend = Person & { hcp: number | null };
/** `id` is the other person; `requestId` answers or withdraws the request. */
export type FriendRequest = Person & { requestId: string };

export type FriendsView = {
  /** Last played first, then by name. */
  friends: Friend[];
  incoming: FriendRequest[];
  outgoing: FriendRequest[];
  /** Most rounds together first (#2267). */
  suggestions: Person[];
  /** The caller's own friend code, `null` when it could not be read. */
  friendCode: string | null;
};

const NO_SHARED_ROUNDS: FriendStats = { roundsTogether: 0, lastPlayedAt: null, lastGameName: null };

/**
 * Everything the friends page shows (#2267), for the web's `/profile/venner`
 * and the app's `GET /api/friends` alike: friends, requests and suggestions
 * with their numbers, and the caller's own friend code.
 *
 * Best-effort like the page has always been: without the numbers the lists
 * still come, with `stats: null` and no handicap.
 */
export async function getFriendsView(userId: string): Promise<FriendsView> {
  const [data, privateFields] = await Promise.all([
    getFriendData(userId),
    // A failed lookup hides the share link (#2207): the code is private.
    getPrivateUserFields([userId]).catch(() => new Map<string, PrivateUserFields>()),
  ]);

  const friendIds = data.friends.map((u) => u.id);
  const everyone = [
    ...friendIds,
    ...data.incoming.map((r) => r.user.id),
    ...data.outgoing.map((r) => r.user.id),
    ...data.suggestions.map((u) => u.id),
  ];
  const [stats, handicaps] = await Promise.all([
    getFriendStats(userId, everyone).catch((err) => {
      console.error('[getFriendsView] stats failed', err);
      return null;
    }),
    getFriendHandicaps(friendIds).catch((err) => {
      console.error('[getFriendsView] handicaps failed', err);
      return new Map<string, number>();
    }),
  ]);

  const person = (user: FriendUser): Person => ({
    id: user.id,
    name: displayNameForOthers(user) ?? '',
    initials: nameInitials(user.name?.trim() || displayNameForOthers({ ...user, nickname: null })),
    stats: stats === null ? null : (stats.get(user.id) ?? NO_SHARED_ROUNDS),
  });
  const toRequest = (row: { id: string; user: FriendUser }): FriendRequest => ({
    requestId: row.id,
    ...person(row.user),
  });
  const friends: Friend[] = data.friends.map((u) => {
    const p = person(u);
    return { ...p, hcp: visibleFriendHcp(handicaps.get(u.id) ?? null, p.stats) };
  });

  return {
    // Without the numbers everyone ties, and the lists stay by name.
    friends: sortByLastPlayed(friends, (f) => f.stats?.lastPlayedAt ?? null),
    incoming: data.incoming.map(toRequest),
    outgoing: data.outgoing.map(toRequest),
    suggestions: sortByRoundsTogether(data.suggestions.map(person), (p) => p.stats),
    friendCode: privateFields.get(userId)?.friendCode ?? null,
  };
}
