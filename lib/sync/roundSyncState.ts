import type { SyncQueueItem, TeeShotQueueItem } from './db';
import { isActiveForGame, queueItemKey } from './queueScope';
import { isLockedCardError } from './classifyError';
import { parseRowKey, summarizeQuarantine } from './quarantineSummary';

/**
 * #2348: what the round on screen has in the sync queues — sent, waiting on the
 * phone, or not saved — for the save chip and its sheet on the app's hole page.
 *
 * Read-only and Dexie-free like `queueScope.ts`: it takes the queue items the
 * caller already listed and never changes the queue, the drain or the
 * quarantine. One rule for "waiting" (`isActiveForGame`) and one for "not
 * saved" (`summarizeQuarantine`), so the chip can never disagree with the
 * banner about which strokes are stuck.
 */

/**
 * How old an untried item must be before the chip turns yellow. With good
 * network the drain answers well inside this, so the chip stays green while a
 * stroke is on its way instead of blinking yellow after every tap.
 */
export const SETTLE_MS = 3000;

export interface RoundSyncState {
  /** Active (not quarantined) stroke items for the game: strokes, not holes. */
  pendingScoreCount: number;
  /** Active tee-shot choices for the game (#2580). Never counted as strokes. */
  pendingTeeShotCount: number;
  /** Holes with an active item in either queue, sorted, deduped. */
  pendingHoles: number[];
  /** Holes with an active stroke item, sorted, deduped: what «Slagene fra hull …» names. */
  pendingScoreHoles: number[];
  /**
   * At least one active item has been tried, has failed, or is older than
   * `SETTLE_MS`. Only then is "waiting" worth showing.
   */
  settled: boolean;
  /** The latest error among the active items is a network failure. */
  lastErrorIsNetwork: boolean;
  /** Holes with quarantined items in this game (#668), sorted, deduped. */
  quarantinedHoles: number[];
  /**
   * Quarantined holes where every item is a locked-card refusal (#2211). Typing
   * such a hole again cannot help, so the sheet offers no link for it.
   */
  quarantineLockedHoles: number[];
  /** Every quarantined item in this game is a locked-card refusal (#2211). */
  quarantineLockedOnly: boolean;
}

type QueueItem = SyncQueueItem | TeeShotQueueItem;

export function roundSyncState({
  scoreItems,
  teeShotItems,
  gameId,
  nowMs,
  isNetworkError,
}: {
  scoreItems: readonly SyncQueueItem[];
  teeShotItems: readonly TeeShotQueueItem[];
  gameId: string;
  nowMs: number;
  /**
   * Is this error text a network failure? Passed in because the classifier
   * lives with the app's fetch (`isNetworkFailureMessage`), and `lib/` never
   * imports from the app.
   */
  isNetworkError: (message: string | null | undefined) => boolean;
}): RoundSyncState {
  const activeScores = scoreItems.filter((item) => isActiveForGame(item, gameId));
  const activeTeeShots = teeShotItems.filter((item) => isActiveForGame(item, gameId));
  const active: QueueItem[] = [...activeScores, ...activeTeeShots];

  const holesOf = (items: readonly QueueItem[]): number[] => {
    const holes = new Set<number>();
    for (const item of items) {
      const parsed = parseRowKey(queueItemKey(item));
      if (parsed) holes.add(parsed.holeNumber);
    }
    return [...holes].sort((a, b) => a - b);
  };

  const settled = active.some(
    (item) =>
      item.attemptCount > 0 ||
      item.lastError != null ||
      nowMs - Date.parse(item.createdAt) >= SETTLE_MS,
  );

  const failed = active
    .filter((item) => item.lastError != null)
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  const latestError = failed[failed.length - 1]?.lastError;

  // The game's own quarantine only: `summarizeQuarantine.lockedOnly` spans
  // every game, and another round's refusal says nothing about this one.
  const ownQuarantine = [...scoreItems, ...teeShotItems].filter(
    (item) => item.abandonedAt != null && parseRowKey(queueItemKey(item))?.gameId === gameId,
  );
  const quarantine = summarizeQuarantine(ownQuarantine, gameId);
  const quarantinedHoles = quarantine.currentGame?.holes ?? [];
  const quarantineLockedHoles = quarantinedHoles.filter((hole) =>
    ownQuarantine
      .filter((item) => parseRowKey(queueItemKey(item))?.holeNumber === hole)
      .every((item) => isLockedCardError(item.lastError)),
  );

  return {
    pendingScoreCount: activeScores.length,
    pendingTeeShotCount: activeTeeShots.length,
    pendingHoles: holesOf(active),
    pendingScoreHoles: holesOf(activeScores),
    settled,
    lastErrorIsNetwork: latestError != null && isNetworkError(latestError),
    quarantinedHoles,
    quarantineLockedHoles,
    quarantineLockedOnly: quarantine.currentGame != null && quarantine.lockedOnly,
  };
}

export type SyncChipState = 'quarantined' | 'pending' | 'saved';

/** Not saved beats waiting; waiting shows only once it has settled. */
export function syncChipState(state: RoundSyncState): SyncChipState {
  if (state.quarantinedHoles.length > 0) return 'quarantined';
  const pending = state.pendingScoreCount + state.pendingTeeShotCount > 0;
  return pending && state.settled ? 'pending' : 'saved';
}

export type SyncCellState = 'quarantined' | 'pending' | 'sent' | 'empty';

/**
 * One hole in the sheet's grid. `scoredHoles` = holes with at least one local
 * stroke in this game; with no queue item left, the server has answered for
 * each of them.
 */
export function syncCellState(
  hole: number,
  state: RoundSyncState,
  scoredHoles: ReadonlySet<number>,
): SyncCellState {
  if (state.quarantinedHoles.includes(hole)) return 'quarantined';
  if (state.pendingHoles.includes(hole)) return 'pending';
  if (scoredHoles.has(hole)) return 'sent';
  return 'empty';
}
