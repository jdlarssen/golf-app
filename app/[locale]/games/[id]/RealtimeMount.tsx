'use client';

import { useEffect } from 'react';
import { subscribeGameScores } from '@/lib/sync/realtime';
import { currentDeviceUserId } from '@/lib/sync/currentUser';
import { mergeServerScore } from '@/lib/sync/mergeServerScore';
import { getBrowserClient } from '@/lib/supabase/client';
import { selectAllRowsResult } from '@/lib/supabase/selectAllRows';

async function catchUp(gameId: string) {
  const supabase = getBrowserClient();
  const { data } = await selectAllRowsResult(
    (from, to) =>
      supabase
        .from('scores')
        .select(
          'game_id, user_id, hole_number, strokes, putts, entered_by, client_updated_at, updated_at',
        )
        .eq('game_id', gameId)
        .order('id')
        .range(from, to),
    'RealtimeMount catch-up scores',
  );
  if (!data) return;
  // Once per catch-up run, outside the merge: awaiting a non-Dexie promise
  // inside a Dexie transaction commits it early (PrematureCommitError).
  const currentUserId = await currentDeviceUserId();
  for (const row of data) {
    // #1611: LWW, conflict notice and queue cleanup all live in the shared
    // merge. Catch-up runs on mount/focus/online/rejoin — i.e. exactly when an iOS
    // PWA wakes up and finds someone else's number in place of yours.
    await mergeServerScore(
      {
        gameId: row.game_id,
        userId: row.user_id,
        holeNumber: row.hole_number,
        strokes: row.strokes,
        putts: row.putts ?? null, // #939
        enteredBy: row.entered_by,
        clientUpdatedAt: row.client_updated_at,
        serverUpdatedAt: row.updated_at,
      },
      currentUserId,
    );
  }
}

export function RealtimeMount({ gameId }: { gameId: string }) {
  useEffect(() => {
    // #2093: scores committed while the channel was down are never replayed,
    // and a mobile network can drop without ever firing `online`.
    const unsubscribe = subscribeGameScores(gameId, {
      onResubscribed: () => {
        void catchUp(gameId);
      },
    });
    return unsubscribe;
  }, [gameId]);

  useEffect(() => {
    // initial catch-up + on focus + on online
    void catchUp(gameId);
    const onFocus = () => {
      void catchUp(gameId);
    };
    const onOnline = () => {
      void catchUp(gameId);
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
