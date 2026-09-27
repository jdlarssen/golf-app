'use client';

import { useEffect } from 'react';
import { subscribeGameScores } from '@/lib/sync/realtime';
import { catchUpGameScores } from '@/lib/sync/catchUp';

export function RealtimeMount({ gameId }: { gameId: string }) {
  useEffect(() => {
    // #2093: scores committed while the channel was down are never replayed,
    // and a mobile network can drop without ever firing `online`.
    const unsubscribe = subscribeGameScores(gameId, {
      onResubscribed: () => {
        void catchUpGameScores(gameId);
      },
    });
    return unsubscribe;
  }, [gameId]);

  useEffect(() => {
    // initial catch-up + on focus + on online
    void catchUpGameScores(gameId);
    const onFocus = () => {
      void catchUpGameScores(gameId);
    };
    const onOnline = () => {
      void catchUpGameScores(gameId);
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
