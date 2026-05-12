'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getBrowserClient } from '@/lib/supabase/client';

type Props = { gameId: string };

/**
 * Subscribes to scores INSERTs for this game so state #3 (timeglass) auto-
 * refreshes the route when the first score lands. The server then re-evaluates
 * `isFrontNineOpen` and may flip to state #3.5 (or stay on state #3 if no team
 * has fully completed front 9 yet).
 *
 * Same setAuth() quirk as ScheduledWaitingRoom — the realtime socket needs the
 * JWT explicitly before subscribing, otherwise RLS treats it as anon and
 * silently drops every postgres_changes event.
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
