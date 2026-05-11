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
  const channel = supabase
    .channel(`scores:${gameId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'scores',
        filter: `game_id=eq.${gameId}`,
      },
      (payload) => {
        const row = (payload.new ?? payload.old) as Partial<ScoreRowFromDb>;
        if (!row || !row.game_id || !row.user_id || row.hole_number == null) return;
        void mergeIncoming(row as ScoreRowFromDb);
      },
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}
