/**
 * The honour board's places (#2326, #2259): who has the most of something.
 * Pure, no server imports, so the native app can import it.
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

/** The board's top ten: everyone with place 10 or better, so a shared tenth place adds rows. */
export function topTen(ranked: readonly RankedEntry[]): RankedEntry[] {
  return ranked.filter((entry) => entry.place <= 10);
}

/** The one on place 1, or `null` when the board is empty or the top is shared. */
export function soleLeader(ranked: readonly RankedEntry[]): RankedEntry | null {
  const leaders = ranked.filter((entry) => entry.place === 1);
  return leaders.length === 1 ? leaders[0] : null;
}

export type ViewerPlace = {
  place: number;
  count: number;
  /** The count the fifth row has over yours; `null` when you are in the top 5. */
  toTop5: number | null;
};

/**
 * Where `userId` stands, or `null` when they are not on the board (a count of zero
 * is not ranked). Place 5 or better is the top 5, shared places included, so
 * `toTop5` is always at least 1 when set.
 */
export function viewerPlace(
  ranked: readonly RankedEntry[],
  userId: string,
): ViewerPlace | null {
  const mine = ranked.find((entry) => entry.userId === userId);
  if (!mine) return null;
  const fifth = ranked[4];
  const toTop5 = mine.place > 5 && fifth ? fifth.count - mine.count : null;
  return { place: mine.place, count: mine.count, toTop5 };
}
