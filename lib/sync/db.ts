import Dexie, { type Table } from 'dexie';

export interface LocalScore {
  id: string; // ${gameId}:${userId}:${holeNumber}
  gameId: string;
  userId: string;
  holeNumber: number;
  strokes: number | null;
  /**
   * Optional per-hole putt count (#939). Non-indexed, so adding it needs no
   * Dexie version bump — rows written before this field shipped read back as
   * `undefined` and are coalesced to null on read/merge. Lives on the same row
   * as strokes and syncs together via upsert_score_if_newer's p_putts param.
   */
  putts: number | null;
  enteredBy: string;
  clientUpdatedAt: string;
  serverUpdatedAt: string | null; // null until first successful sync of this client_updated_at
}

export interface SyncQueueItem {
  id: string; // matches scoreId
  scoreId: string;
  attemptCount: number;
  lastError: string | null;
  createdAt: string;
  /**
   * Set (#668) when drainQueue gives up on a permanently-failing item after
   * MAX_PERMANENT_ATTEMPTS. Quarantined items are skipped by every subsequent
   * drain (no more retry-forever loop) and surfaced distinctly by SyncBanner.
   * Non-indexed — adding it needs no Dexie version bump. Absent on transient /
   * still-retrying items.
   */
  abandonedAt?: string | null;
}

/**
 * Written by syncWorker (#688) when the server-wins branch overwrites a score
 * that the local user had entered. Surfaced by SyncBanner as a one-line notice
 * so the overwrite is never silent. The record is removed when the user
 * dismisses the banner.
 */
export interface ConflictRecord {
  id: string; // ${gameId}:${userId}:${holeNumber}
  gameId: string;
  userId: string;
  holeNumber: number;
  localStrokes: number | null;
  serverStrokes: number | null;
  resolvedAt: string;
}

class GolfDb extends Dexie {
  scores!: Table<LocalScore, string>;
  syncQueue!: Table<SyncQueueItem, string>;
  conflicts!: Table<ConflictRecord, string>;

  constructor() {
    super('golf-app');
    this.version(1).stores({
      scores: 'id, gameId, [gameId+userId], [gameId+holeNumber]',
      syncQueue: 'id, createdAt',
    });
    this.version(2).stores({
      scores: 'id, gameId, [gameId+userId], [gameId+holeNumber]',
      syncQueue: 'id, createdAt',
      conflicts: 'id, gameId, resolvedAt',
    });
  }
}

export const localDb = new GolfDb();

export function scoreKey(
  gameId: string,
  userId: string,
  holeNumber: number,
): string {
  return `${gameId}:${userId}:${holeNumber}`;
}
