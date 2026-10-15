import type { QueueItemBase } from './db';

/**
 * Which round does a queued stroke belong to? (#1370)
 *
 * The Dexie sync queue is global — one queue for every round the player has
 * touched — but every surface that reports its status renders inside ONE round
 * (banner, hole page, submit screen). Without scoping, a stroke left behind by
 * yesterday's round tells today's round "1 stroke waiting" and locks «Lever ✓».
 *
 * Deliberately Dexie-free so these rules are unit-testable without an
 * indexedDB shim, and deliberately NOT in `db.ts`: the key FORMAT stays owned
 * by `scoreKey` there — this module only consumes it.
 *
 * `syncQueue` carries no gameId index (`db.ts` stores `id, createdAt`), so the
 * filter is a JS prefix test on the score key rather than a Dexie `where`.
 */

/**
 * True when `scoreId` was written for `gameId`.
 *
 * `SyncQueueItem.scoreId` IS the score key `${gameId}:${userId}:${holeNumber}`
 * (`scoreKey` in db.ts; `writeScore` is the only writer). Both ids are uuids and
 * therefore colon-free, so testing the prefix WITH its trailing colon is exact:
 * a game id that happens to be a string-prefix of another can never match.
 */
export function belongsToGame(scoreId: string, gameId: string): boolean {
  return scoreId.startsWith(`${gameId}:`);
}

/**
 * #2580: the row key of a queue item, whichever queue it is in. Both keys have
 * three colon-free parts with the game first and the hole last, so
 * `belongsToGame` and the quarantine summary read both the same way. Here and
 * not in `db.ts`, so it stays Dexie-free (tests mock `db.ts` whole).
 */
export function queueItemKey(item: { scoreId: string } | { teeShotId: string }): string {
  return 'teeShotId' in item ? item.teeShotId : item.scoreId;
}

/**
 * #2580: the two functions below take either queue's item; `queueItemKey`
 * gives the score key or the tee-shot key `${gameId}:${teamNumber}:${holeNumber}`
 * (`teeShotKey`), so the same prefix test scopes both.
 */

/**
 * True for items that still retry (not quarantined by #668) AND belong to
 * `gameId` — the set that drives "N strokes waiting", the error copy, the
 * stuck-queue check and the retry button for the round on screen.
 *
 * Quarantined items are excluded here on purpose: they never drain, and
 * SyncBanner surfaces them through its own quarantine branch (#1369), which
 * intentionally sees the UNFILTERED queue so stranded strokes from other rounds
 * stay visible.
 */
export function isActiveForGame(item: QueueItemBase, gameId: string): boolean {
  return item.abandonedAt == null && belongsToGame(queueItemKey(item), gameId);
}

/**
 * True when a queued item must block submitting the scorecard.
 *
 * `blockingGameIds` is every game this delivery can freeze — this round, plus a
 * split-cup front9 sibling round on a back9 host (#1466: `submitScorecard`
 * marks the sibling delivered too). A frozen card makes RLS refuse the sync
 * RPC's write, and the sync worker quarantines the item (#2211,
 * `interpretUpsertReply`) — the stroke never reaches the server either way. So
 * a stroke queued for either game would be lost. Scoping the block naively to
 * the current gameId alone would reintroduce exactly the data loss the #668
 * block exists to prevent.
 *
 * Quarantined items never drain, so blocking on them would trap the player
 * forever — they are excluded.
 */
export function isBlockingItem(
  item: QueueItemBase,
  blockingGameIds: readonly string[],
): boolean {
  return (
    item.abandonedAt == null &&
    blockingGameIds.some((gameId) => belongsToGame(queueItemKey(item), gameId))
  );
}
