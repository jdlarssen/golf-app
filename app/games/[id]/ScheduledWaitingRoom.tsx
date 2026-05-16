'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatCountdown } from '@/lib/format/countdown';
import { subscribeRealtimeChannel } from '@/lib/sync/realtimeChannel';

type Props = { gameId: string; teeOffAt: string };

/**
 * Client-side countdown ticker + realtime listener for the "scheduled" state
 * (Scorekort venter). Updates the countdown label every 30s and refreshes the
 * route as soon as `games.status` flips to `active` so the player sees the
 * normal home view without manually reloading.
 */
export function ScheduledWaitingRoom({ gameId, teeOffAt }: Props) {
  const router = useRouter();
  const [now, setNow] = useState(() => Date.now());

  // Tick every 30s to update countdown text. 30s is precise enough for
  // a ballpark "starter om X min/t" label; the realtime subscription
  // flips the route to active well before sub-30s precision matters.
  // Also force a fresh tick whenever the tab returns to foreground —
  // browsers throttle background intervals, so the user reopens to a
  // possibly-stale countdown without this.
  useEffect(() => {
    const refresh = () => setNow(Date.now());
    const id = window.setInterval(refresh, 30_000);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  // Realtime: listen for game.status flipping to 'active'.
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
    );
  }, [gameId, router]);

  const msUntil = new Date(teeOffAt).getTime() - now;
  const text = formatCountdown(msUntil);

  return (
    <div className="bg-primary text-white dark:text-bg rounded-2xl px-4 py-3.5 flex items-center gap-3">
      <span
        className="inline-block w-2 h-2 rounded-full bg-accent animate-soft-pulse"
        aria-hidden
      />
      <div className="flex-1">
        <p className="font-serif text-[15px] font-medium">{text}</p>
        <p className="text-[11.5px] opacity-75 mt-0.5">
          Vi gir deg beskjed når kortet åpner.
        </p>
      </div>
    </div>
  );
}
