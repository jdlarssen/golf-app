'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getBrowserClient } from '@/lib/supabase/client';

type Props = { gameId: string };

/**
 * Subscribes to two realtime channels for this game and triggers a route
 * refresh on each event:
 *
 * 1. `scores` INSERT — drives the state #3 → #3.5 transition when the front 9
 *    fills, and keeps the live brutto leaderboard fresh while play continues.
 * 2. `games` UPDATE — flips the view from `reveal-active` (or `state3.5` /
 *    `full` in live-mode) to `reveal-finished` / `full` the moment an admin
 *    presses "Avslutt spillet". Without this, the player must manually
 *    refresh to see the reveal flourish.
 *
 * Same setAuth() quirk as ScheduledWaitingRoom — the realtime socket needs the
 * JWT explicitly before subscribing, otherwise RLS treats it as anon and
 * silently drops every postgres_changes event.
 *
 * Name kept for historical reasons (this used to be pre-round only) — it
 * now covers the full leaderboard lifecycle.
 */
export function PreRoundLeaderboardRealtime({ gameId }: Props) {
  const router = useRouter();
  useEffect(() => {
    const supabase = getBrowserClient();
    let cancelled = false;
    let unsubscribe: (() => void) | null = null;

    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session?.access_token) supabase.realtime.setAuth(session.access_token);
      if (cancelled) return;

      const channel = supabase
        .channel(`leaderboard-prerun:${gameId}`)
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
            table: 'games',
            filter: `id=eq.${gameId}`,
          },
          () => router.refresh(),
        )
        .subscribe();

      unsubscribe = () => {
        void supabase.removeChannel(channel);
      };
    })();

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [gameId, router]);

  return null;
}
