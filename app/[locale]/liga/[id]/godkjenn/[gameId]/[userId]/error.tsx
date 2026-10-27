'use client';

import { ErrorScreen } from '@/components/ui/ErrorScreen';

/**
 * #2661: the marker's page reads the card with the service role and throws on
 * a failed read, so it has its own boundary (trap 5): the marker sees the
 * error screen, never a raw 500.
 */
export default function MarkerApproveError({
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
      context="league-marker-error-boundary"
    />
  );
}
