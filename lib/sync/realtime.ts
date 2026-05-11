import { localDb, scoreKey } from './db';
import { getBrowserClient } from '@/lib/supabase/client';

type ScoreRowFromDb = {
  game_id: string;
  user_id: string;
  hole_number: number;
  strokes: number | null;
  entered_by: string;
  client_updated_at: string;
  updated_at: string;
};

/**
 * Merge an incoming row from Supabase Realtime into the local Dexie store.
 * Last-write-wins by client_updated_at; older incoming events are dropped.
 */
async function mergeIncoming(row: ScoreRowFromDb): Promise<void> {
  const id = scoreKey(row.game_id, row.user_id, row.hole_number);
  const existing = await localDb.scores.get(id);
  if (existing && existing.clientUpdatedAt >= row.client_updated_at) {
    // Local has same or newer write — ignore.
    return;
  }
  await localDb.scores.put({
    id,
    gameId: row.game_id,
    userId: row.user_id,
    holeNumber: row.hole_number,
    strokes: row.strokes,
    enteredBy: row.entered_by,
    clientUpdatedAt: row.client_updated_at,
    serverUpdatedAt: row.updated_at,
  });
}

/**
 * Start a realtime subscription for one game. Returns an unsubscribe function.
 * Subscribes to INSERT and UPDATE on scores filtered to this game.
 * RLS limits what the client actually receives — same-flight rows only.
 */
export function subscribeGameScores(gameId: string): () => void {
  const supabase = getBrowserClient();
  // eslint-disable-next-line no-console
  console.log('[realtime] subscribing to scores for game', gameId);
  const channel = supabase
    .channel(`scores:${gameId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'scores',
        // Temporarily removed filter to diagnose whether ANY events arrive.
        // If events show up here, the filter syntax was the issue.
        // If still nothing, RLS or replication is the issue.
      },
      (payload) => {
        // eslint-disable-next-line no-console
        console.log('[realtime DEBUG] raw payload — no filter:', payload);
        // eslint-disable-next-line no-console
        console.log('[realtime] event received', {
          eventType: payload.eventType,
          new: payload.new,
          old: payload.old,
        });
        const row = (payload.new ?? payload.old) as Partial<ScoreRowFromDb>;
        if (!row || !row.game_id || !row.user_id || row.hole_number == null) {
          // eslint-disable-next-line no-console
          console.warn('[realtime] event payload missing required fields, ignored');
          return;
        }
        void mergeIncoming(row as ScoreRowFromDb).then(() => {
          // eslint-disable-next-line no-console
          console.log('[realtime] merged into local db', {
            userId: row.user_id,
            holeNumber: row.hole_number,
            strokes: row.strokes,
          });
        });
      },
    )
    .subscribe((status, err) => {
      // eslint-disable-next-line no-console
      console.log('[realtime] subscription status:', status, err ?? '');
    });

  return () => {
    // eslint-disable-next-line no-console
    console.log('[realtime] unsubscribing from scores for game', gameId);
    void supabase.removeChannel(channel);
  };
}
