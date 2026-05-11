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
 * Subscribe to score changes for one game. The Supabase realtime socket runs
 * a separate connection from HTTP; with @supabase/ssr the cookie session
 * authenticates HTTP but the realtime client needs setAuth() with the JWT
 * before subscribing, otherwise RLS treats the subscriber as anon and
 * silently drops every postgres_changes event.
 */
export function subscribeGameScores(gameId: string): () => void {
  const supabase = getBrowserClient();
  let unsubscribed = false;
  let channelRef: ReturnType<typeof supabase.channel> | null = null;

  (async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session?.access_token) {
      supabase.realtime.setAuth(session.access_token);
    }

    if (unsubscribed) return;

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

    channelRef = channel;
    if (unsubscribed) {
      void supabase.removeChannel(channel);
    }
  })();

  return () => {
    unsubscribed = true;
    if (channelRef) {
      void supabase.removeChannel(channelRef);
    }
  };
}
