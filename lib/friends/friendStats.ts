/**
 * What you and another player have in common on the course (#2256): the
 * sublines on the app's friends screen («8 runder sammen · sist lørdag»,
 * «Spilte med deg i Onsdagsgolfen») and the «Sist spilt først» order.
 *
 * A shared game is a finished, non-derived game you were both in: the same
 * rule as `getFinishedGamesForUser` (a derived cup single is part of its host,
 * not a round of its own). A round is dated by its planned tee-off, else its
 * end, as in the app's round list (`native/app/src/lib/roundHistory.ts`).
 *
 * Pure and I/O-free (Type A). The reads live in `getFriendStats.ts`.
 */

export type FriendStats = {
  roundsTogether: number;
  /** ISO timestamp of the latest shared round, `null` when none is dated. */
  lastPlayedAt: string | null;
  lastGameName: string | null;
};

/** One finished, non-derived game the caller was in. */
export type SharedGame = {
  id: string;
  name: string;
  scheduledTeeOffAt: string | null;
  endedAt: string | null;
};

function playedAt(game: SharedGame): string | null {
  const iso = game.scheduledTeeOffAt ?? game.endedAt;
  return iso != null && !Number.isNaN(Date.parse(iso)) ? iso : null;
}

/**
 * The caller's games and the other players' rows in them → stats per player.
 * A player without a shared game has no entry.
 */
export function friendStatsFromRows(
  games: readonly SharedGame[],
  rows: readonly { game_id: string; user_id: string }[],
): Map<string, FriendStats> {
  const gameById = new Map(games.map((g) => [g.id, g]));
  const gamesByUser = new Map<string, Set<string>>();
  for (const row of rows) {
    if (!gameById.has(row.game_id)) continue;
    const set = gamesByUser.get(row.user_id) ?? new Set<string>();
    set.add(row.game_id);
    gamesByUser.set(row.user_id, set);
  }

  const stats = new Map<string, FriendStats>();
  for (const [userId, gameIds] of gamesByUser) {
    let latest: SharedGame | null = null;
    let latestAt: string | null = null;
    for (const id of gameIds) {
      const g = gameById.get(id)!;
      const at = playedAt(g);
      if (latest === null || (at !== null && (latestAt === null || Date.parse(at) > Date.parse(latestAt)))) {
        latest = g;
        latestAt = at;
      }
    }
    stats.set(userId, {
      roundsTogether: gameIds.size,
      lastPlayedAt: latestAt,
      lastGameName: latest?.name ?? null,
    });
  }
  return stats;
}

/** Latest shared round first, never-played last, then by name. Returns a copy. */
export function sortByLastPlayed<T extends { name: string }>(
  people: readonly T[],
  lastPlayedAt: (person: T) => string | null,
): T[] {
  const time = (p: T) => {
    const iso = lastPlayedAt(p);
    return iso === null ? null : Date.parse(iso);
  };
  return [...people].sort((a, b) => {
    const ta = time(a);
    const tb = time(b);
    if (ta !== tb) {
      if (ta === null) return 1;
      if (tb === null) return -1;
      return tb - ta;
    }
    return a.name.localeCompare(b.name, 'nb');
  });
}
