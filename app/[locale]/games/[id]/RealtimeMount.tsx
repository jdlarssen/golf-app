'use client';

import { useEffect } from 'react';
import { subscribeGameScores, subscribeGameTeeShots } from '@/lib/sync/realtime';
import { catchUpGameScores, catchUpGameTeeShots } from '@/lib/sync/catchUp';

export function RealtimeMount({
  gameId,
  tracksTeeShots = false,
}: {
  gameId: string;
  /** #2580: the game has «Hvem sitt utslag» on, so tee shots sync too. */
  tracksTeeShots?: boolean;
}) {
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
    if (!tracksTeeShots) return;
    // #2580: the same four moments as the scores (#2093): mount, focus,
    // `online` and a channel that is back after an outage.
    const unsubscribe = subscribeGameTeeShots(gameId, {
      onResubscribed: () => {
        void catchUpGameTeeShots(gameId);
      },
    });
    return unsubscribe;
  }, [gameId, tracksTeeShots]);

  useEffect(() => {
    // initial catch-up + on focus + on online
    const catchUp = () => {
      void catchUpGameScores(gameId);
      if (tracksTeeShots) void catchUpGameTeeShots(gameId);
    };
    catchUp();
    window.addEventListener('focus', catchUp);
    window.addEventListener('online', catchUp);
    return () => {
      window.removeEventListener('focus', catchUp);
      window.removeEventListener('online', catchUp);
    };
  }, [gameId, tracksTeeShots]);

  return null;
}
