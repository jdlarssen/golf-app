'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatCountdown } from '@/lib/format/countdown';
import { getBrowserClient } from '@/lib/supabase/client';

type Props = { gameId: string; teeOffAt: string };

/**
 * Client-side countdown ticker + realtime listener for the "scheduled" state
 * (Scorekort venter). Updates the countdown label every 30s and refreshes the
 * route as soon as `games.status` flips to `active` so the player sees the
 * normal home view without manually reloading.
 *
 * Realtime quirk: the Supabase realtime socket runs a separate connection
 * from HTTP; with @supabase/ssr the cookie session authenticates HTTP but
 * the realtime client needs setAuth() with the JWT before subscribing,
 * otherwise RLS treats the subscriber as anon and silently drops every
 * postgres_changes event. See lib/sync/realtime.ts:43-54 for the same
 * pattern used in score sync.
 */
export function ScheduledWaitingRoom({ gameId, teeOffAt }: Props) {
  const router = useRouter();
  const [now, setNow] = useState(() => Date.now());

  // Tick every 30s to update countdown text.
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  // Realtime: listen for game.status flipping to 'active'.
  useEffect(() => {
    const supabase = getBrowserClient();
    let cancelled = false;
    let unsubscribe: (() => void) | null = null;

    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session?.access_token) {
        supabase.realtime.setAuth(session.access_token);
      }
      if (cancelled) return;

      const channel = supabase
        .channel(`game-status:${gameId}`)
        .on(
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
