'use client';

import { useEffect } from 'react';
import { ErrorScreen } from '@/components/ui/ErrorScreen';
import { SPECTATE_POLL_INTERVAL_MS } from '../useSpectatePolling';

/**
 * Error boundary for the big screen (#2275). Nobody stands at the TV and the
 * pointer is hidden, so a passing Supabase error must not leave it on the
 * error screen: it retries by itself every 20 seconds for as long as the
 * boundary stands, and at once when the network comes back.
 *
 * A failed retry does not mount the boundary again — Next renders the same
 * instance with a new `error` — so the retry is an interval, not a one-shot
 * timeout, and keeps trying however many times in a row it fails.
 */
export default function SpectateTvError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    const id = setInterval(() => {
      if (navigator.onLine === false) return;
      unstable_retry();
    }, SPECTATE_POLL_INTERVAL_MS);
    window.addEventListener('online', unstable_retry);
    return () => {
      clearInterval(id);
      window.removeEventListener('online', unstable_retry);
    };
  }, [unstable_retry]);

  return (
    <ErrorScreen
      error={error}
      retry={unstable_retry}
      back={{ href: '/', labelKey: 'toHome' }}
      context="spectate-tv-error-boundary"
    />
  );
}
