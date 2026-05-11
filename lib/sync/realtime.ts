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
 * Start a realtime subscription for one game. Returns a Promise resolving to an
 * unsubscribe function. Authenticates the Realtime WebSocket with the current
 * session JWT before subscribing — without this, the broadcast pipeline treats
 * the subscriber as anon and RLS silently drops postgres_changes events.
 */
export function subscribeGameScores(gameId: string): () => void {
  const supabase = getBrowserClient();
  let unsubscribed = false;
  // Hold the channel ref so the returned cleanup can remove it even if
  // subscribe() races with unsubscribe().
  let channelRef: ReturnType<typeof supabase.channel> | null = null;

  (async () => {
    // Make sure the realtime client knows the JWT so RLS evaluates as this
    // user (not anon). This is required when using @supabase/ssr — the cookies
    // hydrate auth for HTTP but the realtime socket needs the token directly.
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
      supabase.realtime.setAuth(session.access_token);
      // eslint-disable-next-line no-console
      console.log('[realtime] auth token set on realtime client');
    } else {
      // eslint-disable-next-line no-console
      console.warn('[realtime] no session token available — RLS will block events');
    }

    if (unsubscribed) return;

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
          filter: `game_id=eq.${gameId}`,
        },
        (payload) => {
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

    channelRef = channel;
    if (unsubscribed) {
      void supabase.removeChannel(channel);
    }
  })();

  return () => {
    unsubscribed = true;
    if (channelRef) {
      // eslint-disable-next-line no-console
      console.log('[realtime] unsubscribing from scores for game', gameId);
      void supabase.removeChannel(channelRef);
    }
  };
}
