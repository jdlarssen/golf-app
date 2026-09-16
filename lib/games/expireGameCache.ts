import { revalidateTag } from 'next/cache';

/**
 * The one home for "a mutation on a game or cup expires its cache at once"
 * (#2068).
 *
 * - `revalidateTag(tag, 'max')` is stale-while-revalidate: the first reader
 *   after the write still gets the pre-mutation snapshot. On staging that meant
 *   the share-image route kept answering 404 for a game that was already
 *   finished, so «Del resultatet» was missing on the first visit.
 * - `updateTag(tag)` expires at once but throws outside Server Actions, and
 *   several callers here are route handlers (cron sweeps, `/api/*`).
 * - `revalidateTag(tag, { expire: 0 })` expires at once and works in both.
 *
 * Like every `revalidateTag` call it throws during render; a page that needs it
 * wraps the call in `after()`. `lib/games/expireGameCache.test.ts` fails when a
 * `game-`/`tournament-` tag is revalidated anywhere else.
 */
export function expireGameCache(gameId: string): void {
  revalidateTag(`game-${gameId}`, { expire: 0 });
}

/** Same rule for a cup's `tournament-${id}` tag. */
export function expireTournamentCache(tournamentId: string): void {
  revalidateTag(`tournament-${tournamentId}`, { expire: 0 });
}
