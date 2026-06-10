'use client';

import { useEffect } from 'react';
import { subscribeGameScores } from '@/lib/sync/realtime';
import { localDb } from '@/lib/sync/db';
import { getBrowserClient } from '@/lib/supabase/client';

export function RealtimeMount({ gameId }: { gameId: string }) {
  useEffect(() => {
    const unsubscribe = subscribeGameScores(gameId);
    return unsubscribe;
  }, [gameId]);

  useEffect(() => {
    async function catchUp() {
      const supabase = getBrowserClient();
      const { data } = await supabase
        .from('scores')
        .select(
          'game_id, user_id, hole_number, strokes, entered_by, client_updated_at, updated_at',
        )
        .eq('game_id', gameId);
      if (!data) return;
      for (const row of data) {
        const id = `${row.game_id}:${row.user_id}:${row.hole_number}`;
        const existing = await localDb.scores.get(id);
        if (existing && existing.clientUpdatedAt >= row.client_updated_at) continue;
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
    }
    // initial catch-up + on focus + on online
    void catchUp();
    const onFocus = () => {
      void catchUp();
    };
    const onOnline = () => {
      void catchUp();
    };
    window.addEventListener('focus', onFocus);
    window.addEventListener('online', onOnline);
    return () => {
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('online', onOnline);
    };
  }, [gameId]);

  return null;
}
