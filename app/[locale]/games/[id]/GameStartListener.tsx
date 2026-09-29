'use client';

import { useEffect } from 'react';
import { useRouter } from '@/i18n/navigation';
import { subscribeRealtimeChannel } from '@/lib/sync/realtimeChannel';

/**
 * Delays between the extra refreshes after the start, in ms (15 s in total).
 * Every start path flips `games.status` first and expires the game cache
 * after it: the start route and the admin button announce the start in
 * between. The realtime UPDATE can beat the expiry, and the first refresh then
 * renders the cached «scheduled» page (seen on staging, #2219).
 */
const REFRESH_BACKOFF_MS = [1_000, 2_000, 4_000, 8_000];

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
 * The page only renders this in its scheduled branch. Once a refresh renders
 * the active game, the listener unmounts and its backoff stops with it; until
 * then it asks again (`REFRESH_BACKOFF_MS`).
 *
 * Same topic as the app's `subscribeGameStatus`.
 */
export function GameStartListener({ gameId }: { gameId: string }) {
  const router = useRouter();

  useEffect(() => {
    let retry: ReturnType<typeof setTimeout> | null = null;

    const refreshUntilActive = (attempt = 0) => {
      router.refresh();
      if (attempt >= REFRESH_BACKOFF_MS.length) return;
      if (retry) clearTimeout(retry);
      retry = setTimeout(
        () => refreshUntilActive(attempt + 1),
        REFRESH_BACKOFF_MS[attempt],
      );
    };

    const unsubscribe = subscribeRealtimeChannel(
      `game-status:${gameId}`,
      (channel) =>
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
              refreshUntilActive();
            }
          },
        ),
      // #2093: a start committed while the channel was down is never
      // replayed. Refresh and let the server say which status the game has.
      { onResubscribed: () => router.refresh() },
    );

    return () => {
      if (retry) clearTimeout(retry);
      unsubscribe();
    };
  }, [gameId, router]);

  return null;
}
