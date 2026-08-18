import type { ConflictRecord, LocalScore } from './db';

export interface ConflictInput {
  localClientUpdatedAt: string; // ISO timestamp
  serverClientUpdatedAt: string;
}

export type ConflictResolution = 'local-wins' | 'server-wins' | 'equal';

export function resolveConflict(input: ConflictInput): ConflictResolution {
  if (input.localClientUpdatedAt > input.serverClientUpdatedAt)
    return 'local-wins';
  if (input.localClientUpdatedAt < input.serverClientUpdatedAt)
    return 'server-wins';
  return 'equal';
}

export interface ConflictRecordInput {
  /** The local row about to be replaced by a server value. */
  existing: LocalScore;
  /** Strokes on the incoming server row. */
  incomingStrokes: number | null;
  /** Who is logged in on THIS device; null when the session lookup failed. */
  currentUserId: string | null;
}

/**
 * The one home for "does this overwrite deserve a notice?" (#1611).
 *
 * Both paths that let a server value replace a local one call this: the drain
 * (`syncWorker`, the offline case) and the server→local merge
 * (`mergeServerScore`, realtime / catch-up / hole seed). The rule used to live
 * only in the drain, so the online case overwrote in silence — a second copy
 * of the comparison is exactly the bug, so it gets one definition (trap 4).
 *
 * Two conditions, both inherited unchanged from #688/#1368:
 * - strokes actually differ (a putts-only change is not worth a notice), and
 * - the number being replaced was typed on THIS device. That is
 *   `enteredBy === currentUserId`, not `enteredBy === userId`: keeping score
 *   for a flight-mate (marker role) writes rows with enteredBy = you and
 *   userId = the mate, so the old comparison never matched and the mate's
 *   device could wipe your number in silence. Without a session we cannot
 *   tell who "you" are, so we keep the pre-#1368 proxy — it only ever matches
 *   a player's own rows, which is also why such a record is own-score.
 */
export function conflictRecordFor({
  existing,
  incomingStrokes,
  currentUserId,
}: ConflictRecordInput): ConflictRecord | null {
  const strokesChanged = existing.strokes !== incomingStrokes;
  const enteredOnThisDevice =
    currentUserId != null
      ? existing.enteredBy === currentUserId
      : existing.enteredBy === existing.userId;

  if (!strokesChanged || !enteredOnThisDevice) return null;

  return {
    id: existing.id,
    gameId: existing.gameId,
    userId: existing.userId,
    holeNumber: existing.holeNumber,
    localStrokes: existing.strokes,
    serverStrokes: incomingStrokes,
    resolvedAt: new Date().toISOString(),
    forOwnScore: currentUserId == null || existing.userId === currentUserId,
  };
}
