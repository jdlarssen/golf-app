'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { subscribeRealtimeChannel } from '@/lib/sync/realtimeChannel';

type Props = { gameId: string };

/**
 * Audit 2026-11-20: the finish flips the game row before its server action
 * returns, and Next expires the game cache only when the action returns (it
 * queues `revalidateTag` until then; the slow tail runs in `after()`). The
 * refresh at the flip can still read the cached «active» game, and no new
 * event comes once the action has returned. After a flip to finished the
 * listener refreshes a few more times with backoff, and stops as soon as the
 * view changes: this component unmounts with the blind view.
 */
export const FINISH_FOLLOW_UP_DELAYS_MS = [2_000, 4_000, 8_000, 16_000, 32_000] as const;

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
    let followUp: ReturnType<typeof setTimeout> | null = null;
    let followUpStarted = false;
    const followUpFinish = () => {
      if (followUpStarted) return;
      followUpStarted = true;
      const step = (i: number) => {
        if (i >= FINISH_FOLLOW_UP_DELAYS_MS.length) return;
        followUp = setTimeout(() => {
          router.refresh();
          step(i + 1);
        }, FINISH_FOLLOW_UP_DELAYS_MS[i]);
      };
      step(0);
    };
    const unsubscribe = subscribeRealtimeChannel(`leaderboard-prerun:${gameId}`, (channel) =>
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
          (payload: { new?: { status?: string } }) => {
            router.refresh();
            if (payload?.new?.status === 'finished') followUpFinish();
          },
        ),
      // #2093: events committed while the channel was down are never replayed.
      { onResubscribed: () => router.refresh() },
    );
    return () => {
      if (followUp) clearTimeout(followUp);
      unsubscribe();
    };
  }, [gameId, router]);

  return null;
}
