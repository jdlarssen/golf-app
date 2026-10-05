/**
 * The order of the cards on step 4 (#2321): you first, then the people you
 * played with most recently, then everyone else by name, and players without
 * a name (a pending invite) last.
 *
 * The «last played» rule is #2256's `sortByLastPlayed`; this module only puts
 * you in front and the nameless at the back. Pure logic — the native app can
 * read it later.
 */

import { sortByLastPlayed, type FriendStats } from '@/lib/friends/friendStats';

export function orderPickerPlayers<T extends { id: string; name: string | null }>(
  players: readonly T[],
  stats: ReadonlyMap<string, Pick<FriendStats, 'lastPlayedAt'>>,
  selfId: string,
): T[] {
  const self = players.filter((p) => p.id === selfId);
  const others = players.filter((p) => p.id !== selfId);
  const named = others.filter((p): p is T & { name: string } => p.name !== null);
  const nameless = others.filter((p) => p.name === null);
  const sorted = sortByLastPlayed(named, (p) => stats.get(p.id)?.lastPlayedAt ?? null);
  return [...self, ...sorted, ...nameless];
}

/** The ids «last played» is looked up for: friends and every club member, without you. */
export function pickerStatsIds({
  friendPlayerIds,
  clubMemberIdsByClub,
  selfId,
}: {
  friendPlayerIds: readonly string[];
  clubMemberIdsByClub: Readonly<Record<string, readonly string[]>>;
  selfId: string;
}): string[] {
  const ids = new Set<string>(friendPlayerIds);
  for (const members of Object.values(clubMemberIdsByClub)) {
    for (const id of members) ids.add(id);
  }
  ids.delete(selfId);
  return [...ids];
}
