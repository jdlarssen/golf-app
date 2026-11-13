/**
 * The honour board's places (#2326; #2259 can use it): who has the most wins.
 * Pure, no server imports, so the native app can rank the same way later.
 */

export type BoardEntry = { userId: string; name: string; count: number };

export type RankedEntry = BoardEntry & {
  /** Equal counts share a place, and the next one skips: 1, 2, 2, 4. */
  place: number;
};

/**
 * Most wins first, then name (Norwegian order). A count of zero is not on the
 * board. `onlyUserIds` keeps only those users (a club board keeps its current
 * members), and the places are counted after that filter, so the board never
 * starts at 2 because a former member won more.
 */
export function rankBoard(
  counts: readonly BoardEntry[],
  opts: { onlyUserIds?: ReadonlySet<string> } = {},
): RankedEntry[] {
  const sorted = counts
    .filter((e) => e.count > 0 && (opts.onlyUserIds?.has(e.userId) ?? true))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'nb'));
  // The first row with the same count gives the place: 1, 2, 2, 4.
  return sorted.map((entry) => ({
    ...entry,
    place: sorted.findIndex((other) => other.count === entry.count) + 1,
  }));
}
