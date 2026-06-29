import { localDb, scoreKey } from './db';
import { subscribeRealtimeChannel } from './realtimeChannel';

type ScoreRowFromDb = {
  game_id: string;
  user_id: string;
  hole_number: number;
  strokes: number | null;
  putts: number | null;
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
    return;
  }
  await localDb.scores.put({
    id,
    gameId: row.game_id,
    userId: row.user_id,
    holeNumber: row.hole_number,
    strokes: row.strokes,
    putts: row.putts ?? null, // #939: coalesce — pre-migration rows lack the field
    enteredBy: row.entered_by,
    clientUpdatedAt: row.client_updated_at,
    serverUpdatedAt: row.updated_at,
  });
}

/**
 * Subscribe to score changes for one game. Channel setup, auth handoff, and
 * leak-resistant teardown are handled by `subscribeRealtimeChannel`.
 */
export function subscribeGameScores(gameId: string): () => void {
  return subscribeRealtimeChannel(`scores:${gameId}`, (channel) =>
    channel.on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'scores',
        filter: `game_id=eq.${gameId}`,
      },
      (payload) => {
        const row = (payload.new ?? payload.old) as Partial<ScoreRowFromDb>;
        if (!row || !row.game_id || !row.user_id || row.hole_number == null)
          return;
        void mergeIncoming(row as ScoreRowFromDb);
      },
    ),
  );
}
