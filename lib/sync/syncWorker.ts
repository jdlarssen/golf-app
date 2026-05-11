import { localDb } from './db';
import { getBrowserClient } from '@/lib/supabase/client';

let inFlight = false;

export async function drainQueue(): Promise<{
  pushed: number;
  rejected: number;
  errored: number;
}> {
  if (inFlight) return { pushed: 0, rejected: 0, errored: 0 };
  inFlight = true;
  try {
    const queue = await localDb.syncQueue.orderBy('createdAt').toArray();
    if (queue.length === 0) return { pushed: 0, rejected: 0, errored: 0 };

    const supabase = getBrowserClient();
    let pushed = 0;
    let rejected = 0;
    let errored = 0;

    for (const item of queue) {
      const score = await localDb.scores.get(item.scoreId);
      if (!score) {
        await localDb.syncQueue.delete(item.id);
        continue;
      }

      const { data, error } = await supabase.rpc('upsert_score_if_newer', {
        p_game_id: score.gameId,
        p_user_id: score.userId,
        p_hole_number: score.holeNumber,
        p_strokes: score.strokes,
        p_entered_by: score.enteredBy,
        p_client_updated_at: score.clientUpdatedAt,
      });

      if (error) {
        await localDb.syncQueue.update(item.id, {
          attemptCount: item.attemptCount + 1,
          lastError: error.message,
        });
        errored++;
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
        // Server had a newer entry. Replace our local copy with the server's.
        await localDb.scores.update(item.scoreId, {
          strokes: row.strokes,
          enteredBy: row.entered_by,
          clientUpdatedAt: row.client_updated_at,
          serverUpdatedAt: row.updated_at,
        });
        rejected++;
      }
      await localDb.syncQueue.delete(item.id);
    }

    return { pushed, rejected, errored };
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
