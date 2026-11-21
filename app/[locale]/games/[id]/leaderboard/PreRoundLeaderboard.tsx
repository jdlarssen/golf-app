'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { subscribeRealtimeChannel } from '@/lib/sync/realtimeChannel';

type Props = { gameId: string };

/**
 * Audit 2026-11-20: the finish flips the game row first, but the server
 * expires the game cache only when the whole finish action is done (Next
 * queues `revalidateTag` inside a server action until the action ends, and the
 * finish also writes the round report and sends mail). The refresh at the flip
 * therefore reads the cached «active» game. After a flip to finished the
 * listener refreshes every few seconds until the view changes (this component
 * unmounts with the blind view) or the follow-up runs out.
 */
export const FINISH_FOLLOW_UP_MS = 3_000;
export const FINISH_FOLLOW_UP_TRIES = 40;

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
    let followUp: ReturnType<typeof setInterval> | null = null;
    const followUpFinish = () => {
      if (followUp) return;
      let tries = 0;
      followUp = setInterval(() => {
        tries += 1;
        router.refresh();
        if (tries >= FINISH_FOLLOW_UP_TRIES && followUp) clearInterval(followUp);
      }, FINISH_FOLLOW_UP_MS);
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
      if (followUp) clearInterval(followUp);
      unsubscribe();
    };
  }, [gameId, router]);

  return null;
}
