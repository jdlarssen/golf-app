'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { subscribeRealtimeChannel } from '@/lib/sync/realtimeChannel';

type Props = { gameId: string };

/**
 * Subscribes to three realtime channels for this game and triggers a route
 * refresh on each event:
 *
 * 1. `scores` INSERT — drives the state #3 → #3.5 transition when the front 9
 *    fills, and keeps the live brutto leaderboard fresh while play continues.
 * 2. `scores` UPDATE — catches score corrections via `upsert_score_if_newer`
 *    (#745) so the leaderboard stays accurate after a player adjusts a stroke.
 * 3. `games` UPDATE — flips the view from `reveal-active` (or `state3.5` /
 *    `full` in live-mode) to `reveal-finished` / `full` the moment an admin
 *    presses "Avslutt spillet". Without this, the player must manually
 *    refresh to see the reveal flourish.
 *
 * Name kept for historical reasons (this used to be pre-round only) — it
 * now covers the full leaderboard lifecycle.
 */
export function PreRoundLeaderboardRealtime({ gameId }: Props) {
  const router = useRouter();
  useEffect(() => {
    return subscribeRealtimeChannel(`leaderboard-prerun:${gameId}`, (channel) =>
      channel
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'scores',
            filter: `game_id=eq.${gameId}`,
          },
          () => router.refresh(),
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'scores',
            filter: `game_id=eq.${gameId}`,
          },
          () => router.refresh(),
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'games',
            filter: `id=eq.${gameId}`,
          },
          () => router.refresh(),
        ),
    );
  }, [gameId, router]);

  return null;
}
