'use client';

import { ErrorScreen } from '@/components/ui/ErrorScreen';

/**
 * Error boundary for the shareable league link (#2662, AGENTS.md trap 5:
 * every route needs an `error.tsx` so a player never meets a raw 500).
 *
 * On the `bli-med` level, not `[code]`, so it covers any code. An unknown code
 * is not an error here: it gives `notFound()` and the branded 404. This catches
 * the unexpected, a Supabase hiccup in one of the reads.
 */
export default function LigaBliMedError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <ErrorScreen
      error={error}
      retry={unstable_retry}
      back={{ href: '/', labelKey: 'toHome' }}
      context="liga-bli-med-error-boundary"
    />
  );
}
