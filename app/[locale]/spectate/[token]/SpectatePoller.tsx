'use client';

import { useEffect } from 'react';
import { useRouter } from '@/i18n/navigation';

/**
 * Invisible client island that keeps the spectate page fresh while the game
 * is active by calling `router.refresh()` on a 20-second interval.
 *
 * Polling stops automatically when the game finishes (`live === false`), and
 * the interval is cleared on unmount to avoid leaks. We intentionally do NOT
 * use Supabase Realtime here: anonymous clients cannot subscribe to
 * `postgres_changes` (RLS blocks JWT-less WebSocket connections), so polling
 * is the robust MVP for this read-only public surface (#938).
 */
export function SpectatePoller({
  live,
  intervalMs = 20_000,
}: {
  live: boolean;
  /** #1024: liga-embedden poller roligere (60 s) — sesongtabellen endres sjelden. */
  intervalMs?: number;
}) {
  const router = useRouter();

  useEffect(() => {
    if (!live) return;

    const id = setInterval(() => {
      router.refresh();
    }, intervalMs);

    return () => clearInterval(id);
  }, [live, intervalMs, router]);

  // Renders nothing — purely a side-effect island.
  return null;
}
