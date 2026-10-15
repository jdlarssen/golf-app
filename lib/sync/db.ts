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
 * «Hvem sitt utslag» (#2580): whose tee shot the team used on a hole. Lives in
 * its own table, as on the server (`team_tee_shots`): a scores row is replaced
 * whole on every write, so a phone that had not seen the choice would wipe it.
 * The key has the same three colon-free parts as the score key, so
 * `belongsToGame` and the quarantine summary read both the same way.
 */
export interface LocalTeeShot {
  id: string; // ${gameId}:${teamNumber}:${holeNumber}
  gameId: string;
  teamNumber: number;
  holeNumber: number;
  /** Null = the choice was cleared. */
  teeShotBy: string | null;
  enteredBy: string;
  clientUpdatedAt: string;
  serverUpdatedAt: string | null;
}

/** A tee shot waiting for `set_team_tee_shot_if_newer`; same rules as `SyncQueueItem`. */
export interface TeeShotQueueItem {
  id: string; // matches teeShotId
  teeShotId: string;
  attemptCount: number;
  lastError: string | null;
  createdAt: string;
  abandonedAt?: string | null;
}

/**
 * An item from either queue (#2580): the counts, the quarantine banner and the
 * delivery block read both through this. Each carries its row key in its own
 * field — `scoreId` (`${gameId}:${userId}:${holeNumber}`) or `teeShotId`
 * (`${gameId}:${teamNumber}:${holeNumber}`) — read with `queueItemKey`
 * (`queueScope.ts`).
 */
export type QueueItemBase = Pick<
  SyncQueueItem,
  'id' | 'attemptCount' | 'lastError' | 'createdAt' | 'abandonedAt'
> &
  ({ scoreId: string } | { teeShotId: string });


/**
 * Written whenever a server value replaces a score that was entered on this
 * device: by syncWorker's server-wins branch (#688 — the offline case) and by
 * mergeServerScore (#1611), which covers realtime, catch-up and the hole seed
 * and so fires while both phones are online. Surfaced by SyncBanner as a
 * one-line notice so the overwrite is never silent. The record is removed when
 * the user dismisses the banner.
 */
export interface ConflictRecord {
  id: string; // ${gameId}:${userId}:${holeNumber}
  gameId: string;
  userId: string;
  holeNumber: number;
  localStrokes: number | null;
  serverStrokes: number | null;
  resolvedAt: string;
  /**
   * False (#1368) when the overwritten row was one the device owner kept for a
   * flight-mate (marker role) rather than their own score — SyncBanner then
   * picks the "the number you kept for someone else" wording. Non-indexed, so
   * adding it needs no Dexie version bump; `undefined` on records written
   * before #1368 and read as own score.
   */
  forOwnScore?: boolean;
}

class GolfDb extends Dexie {
  scores!: Table<LocalScore, string>;
  syncQueue!: Table<SyncQueueItem, string>;
  conflicts!: Table<ConflictRecord, string>;
  teeShots!: Table<LocalTeeShot, string>;
  teeShotQueue!: Table<TeeShotQueueItem, string>;

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
    // #2580: the two tee-shot tables. Every table from version 2 unchanged.
    this.version(3).stores({
      scores: 'id, gameId, [gameId+userId], [gameId+holeNumber]',
      syncQueue: 'id, createdAt',
      conflicts: 'id, gameId, resolvedAt',
      teeShots: 'id, gameId',
      teeShotQueue: 'id, createdAt',
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

export function teeShotKey(
  gameId: string,
  teamNumber: number,
  holeNumber: number,
): string {
  return `${gameId}:${teamNumber}:${holeNumber}`;
}
