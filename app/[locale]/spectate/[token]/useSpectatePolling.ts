'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from '@/i18n/navigation';
import { useOnline } from '@/hooks/useOnline';

export const SPECTATE_POLL_INTERVAL_MS = 20_000;

export type SpectatePollingState = {
  /** Browser connectivity, per `navigator.onLine`. */
  isOnline: boolean;
  /**
   * When we last *attempted* a refresh — `null` until the first client effect
   * has run. Deliberately not "when data was last confirmed fresh": a
   * `router.refresh()` in Next 16 returns void, so there is no success signal
   * to key a stronger claim on. Copy that renders this must survive that
   * distinction ("Oppdatert HH:MM", never "bekreftet").
   */
  lastUpdatedAt: Date | null;
};

/**
 * Owns the spectate page's freshness loop (#938, reworked in #1376).
 *
 * We intentionally do NOT use Supabase Realtime: anonymous clients cannot
 * subscribe to `postgres_changes` (RLS blocks JWT-less WebSocket connections),
 * so polling stays the robust answer for this read-only public surface.
 *
 * Connectivity handling:
 *  - offline → the interval is torn down. Ticking `router.refresh()` into a
 *    dead uplink only burns battery, and it used to leave the UI pulsing over
 *    frozen numbers.
 *  - offline → online → one immediate `router.refresh()`, then the interval
 *    restarts. The spectator gets current numbers on reconnect, not up to
 *    `intervalMs` later.
 *
 * `lastUpdatedAt` starts `null` and is only ever set inside an effect — never
 * in a `useState` initializer, which would produce a server/client mismatch.
 */
export function useSpectatePolling(
  live: boolean,
  intervalMs: number = SPECTATE_POLL_INTERVAL_MS,
): SpectatePollingState {
  const router = useRouter();
  const isOnline = useOnline();
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  // Tracks whether the previous pass through this effect was an offline one,
  // so a reconnect refreshes but a plain mount does not (the server just
  // rendered this HTML — refreshing it again would be a wasted round trip).
  const wasOfflineRef = useRef(false);

  useEffect(() => {
    // Finished games never poll and never start a timer.
    if (!live) return;

    if (!isOnline) {
      wasOfflineRef.current = true;
      return;
    }

    if (wasOfflineRef.current) {
      wasOfflineRef.current = false;
      router.refresh();
      setLastUpdatedAt(new Date());
    } else {
      // First mount while online: stamp the server render as the baseline.
      setLastUpdatedAt((prev) => prev ?? new Date());
    }

    const id = setInterval(() => {
      router.refresh();
      setLastUpdatedAt(new Date());
    }, intervalMs);

    return () => clearInterval(id);
  }, [live, isOnline, intervalMs, router]);

  return { isOnline, lastUpdatedAt };
}
