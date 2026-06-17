import { localDb } from './db';
import { getBrowserClient } from '@/lib/supabase/client';
import { syncRetryDecision } from './classifyError';
import { resolveConflict } from './conflict';

let inFlight = false;

export async function drainQueue(): Promise<{
  pushed: number;
  rejected: number;
  errored: number;
  abandoned: number;
}> {
  if (inFlight) return { pushed: 0, rejected: 0, errored: 0, abandoned: 0 };
  inFlight = true;
  try {
    const queue = await localDb.syncQueue.orderBy('createdAt').toArray();
    if (queue.length === 0)
      return { pushed: 0, rejected: 0, errored: 0, abandoned: 0 };

    const supabase = getBrowserClient();
    let pushed = 0;
    let rejected = 0;
    let errored = 0;
    let abandoned = 0;

    for (const item of queue) {
      // Quarantined (#668): a permanently-failing item we already gave up on.
      // Skip it so it never re-enters the retry loop; it stays in the queue as
      // a record of failure that SyncBanner surfaces to the player.
      if (item.abandonedAt) continue;

      const score = await localDb.scores.get(item.scoreId);
      if (!score) {
        await localDb.syncQueue.delete(item.id);
        continue;
      }

      const { data, error } = await supabase.rpc('upsert_score_if_newer', {
        p_game_id: score.gameId,
        p_user_id: score.userId,
        p_hole_number: score.holeNumber,
        // scores.strokes is a nullable column; null is a valid score-clear value.
        // Generated RPC arg type is non-null so we cast.
        p_strokes: score.strokes as number,
        p_entered_by: score.enteredBy,
        p_client_updated_at: score.clientUpdatedAt,
      });

      if (error) {
        // #668: a stuck item used to retry forever. Cap ONLY explicitly
        // permanent failures (RLS / constraint / malformed) — transient
        // network / auth / rate-limit / unknown errors keep retrying so a
        // genuinely-entered stroke is never dropped because the player was
        // offline. A withdrawn / submitted target no longer errors here at
        // all: the RPC returns a graceful no-op (was_applied=false) and falls
        // through to the success branch below.
        const decision = syncRetryDecision({
          attemptCount: item.attemptCount,
          errorMessage: error.message,
        });
        if (decision === 'abandon') {
          await localDb.syncQueue.update(item.id, {
            attemptCount: item.attemptCount + 1,
            lastError: error.message,
            abandonedAt: new Date().toISOString(),
          });
          abandoned++;
        } else {
          await localDb.syncQueue.update(item.id, {
            attemptCount: item.attemptCount + 1,
            lastError: error.message,
          });
          errored++;
        }
        continue;
      }

      const row = Array.isArray(data) ? data[0] : data;
      const wasApplied = row?.was_applied ?? false;

      if (wasApplied) {
        await localDb.scores.update(item.scoreId, {
          serverUpdatedAt: row.updated_at,
        });
        pushed++;
      } else {
        // Server had a newer-or-equal entry. Resolve via LWW timestamp
        // comparison to decide what to do:
        //
        // - 'server-wins': overwrite local with the server row (genuine LWW).
        // - 'equal': impossible post-#688 (writeScore now guarantees strictly
        //   increasing timestamps) but kept defensive — treat as keep-local to
        //   avoid a silent drop on any edge that bypasses writeScore.
        // - 'local-wins': should not happen (RPC rejects only when server >=
        //   local), but if it somehow does, keep local.
        //
        // When server genuinely wins AND the local score was entered by the
        // current user AND strokes actually differ, write a ConflictRecord so
        // SyncBanner can surface the silent overwrite (#688 Part 2).
        const resolution = resolveConflict({
          localClientUpdatedAt: score.clientUpdatedAt,
          serverClientUpdatedAt: row.client_updated_at,
        });

        if (resolution === 'server-wins') {
          // Surface the overwrite as a ConflictRecord when the local score was
          // entered by the owner of this device AND strokes actually changed.
          // `score` is the local row read above — no extra DB call needed.
          const strokesChanged = score.strokes !== row.strokes;
          const enteredByCurrentUser = score.enteredBy === score.userId;

          if (strokesChanged && enteredByCurrentUser) {
            await localDb.conflicts.put({
              id: item.scoreId,
              gameId: score.gameId,
              userId: score.userId,
              holeNumber: score.holeNumber,
              localStrokes: score.strokes,
              serverStrokes: row.strokes,
              resolvedAt: new Date().toISOString(),
            });
          }

          await localDb.scores.update(item.scoreId, {
            strokes: row.strokes,
            enteredBy: row.entered_by,
            clientUpdatedAt: row.client_updated_at,
            serverUpdatedAt: row.updated_at,
          });
          rejected++;
        }
        // 'equal' or 'local-wins': keep local data as-is, just remove from queue.
      }
      await localDb.syncQueue.delete(item.id);
    }

    return { pushed, rejected, errored, abandoned };
  } finally {
    inFlight = false;
  }
}

// Client-side bootstrap: start listening to online events and a fallback interval.
let started = false;
export function startSyncListener() {
  if (typeof window === 'undefined' || started) return;
  started = true;
  window.addEventListener('online', () => {
    void drainQueue();
  });
  window.addEventListener('focus', () => {
    void drainQueue();
  });
  setInterval(() => {
    void drainQueue();
  }, 30_000);
  // Try once on bootstrap.
  void drainQueue();
}
