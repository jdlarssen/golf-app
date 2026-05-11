'use client';

import { useEffect } from 'react';
import { subscribeGameScores } from '@/lib/sync/realtime';

export function RealtimeMount({ gameId }: { gameId: string }) {
  useEffect(() => {
    const unsubscribe = subscribeGameScores(gameId);
    return unsubscribe;
  }, [gameId]);
  return null;
}
