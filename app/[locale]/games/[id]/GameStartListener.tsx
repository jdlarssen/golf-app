'use client';

import { useEffect } from 'react';
import { useRouter } from '@/i18n/navigation';
import { subscribeRealtimeChannel } from '@/lib/sync/realtimeChannel';

/**
 * Realtime listener for a scheduled game's start (#2219). Refreshes the route
 * as soon as `games.status` flips to `active`, so the player sees the normal
 * home view without reloading.
 *
 * Mounted once for every scheduled game, with or without a tee-off. It used to
 * live inside `ScheduledWaitingRoom`, which only mounts with a tee-off, so a
 * game the organiser started without one left the player on «Scorekortet
 * åpner når arrangøren starter kampen.» until they reloaded.
 *
 * Same topic as the app's `subscribeGameStatus`.
 */
export function GameStartListener({ gameId }: { gameId: string }) {
  const router = useRouter();

  useEffect(() => {
    return subscribeRealtimeChannel(`game-status:${gameId}`, (channel) =>
      channel.on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'games',
          filter: `id=eq.${gameId}`,
        },
        (payload) => {
          const next = payload.new as { status?: string };
          if (next?.status === 'active') {
            router.refresh();
          }
        },
      ),
      // #2093: a start committed while the channel was down is never
      // replayed. Refresh and let the server say which status the game has.
      { onResubscribed: () => router.refresh() },
    );
  }, [gameId, router]);

  return null;
}
