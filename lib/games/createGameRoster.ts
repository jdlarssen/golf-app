import type { PlayerOption } from '@/app/[locale]/admin/games/new/GameForm';

/**
 * The roster `/opprett-spill` works from: co-players ∪ friends ∪ club members,
 * deduped on id (#464, lifted out for #2018).
 *
 * The first occurrence wins, in that source order. Co-players come from the
 * users table and carry the richest row (`isGuest`), and they already include
 * the organiser, so the organiser appears exactly once even when they are a
 * member of their own club. Friends never include the organiser.
 *
 * Pure so the dedupe has a Type A home; `getCreateGamePlayerRoster` does the
 * fetching.
 */
export function mergeCreateGameRoster(sources: {
  coPlayers: readonly PlayerOption[];
  friends: readonly PlayerOption[];
  clubMembers: readonly PlayerOption[];
}): PlayerOption[] {
  const seen = new Set<string>();
  const merged: PlayerOption[] = [];
  for (const player of [
    ...sources.coPlayers,
    ...sources.friends,
    ...sources.clubMembers,
  ]) {
    if (seen.has(player.id)) continue;
    seen.add(player.id);
    merged.push(player);
  }
  return merged;
}
