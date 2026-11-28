'use client';

import { ErrorScreen } from '@/components/ui/ErrorScreen';

/**
 * Error boundary for «Rapporter» (#3019, AGENTS.md trap 5): the page reads the
 * reports and its actions rename a round or clear its prizes, so a thrown
 * read or write never reaches the admin as a raw 500.
 */
export default function ReportsError({
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
      back={{ href: '/admin', labelKey: 'toHome' }}
      context="admin-reports-error-boundary"
    />
  );
}
