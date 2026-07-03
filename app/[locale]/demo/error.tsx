'use client';

import { ErrorScreen } from '@/components/ui/ErrorScreen';

/**
 * Feilgrense for prøvespill-ruten (#1042). Hver rute skal ha en error.tsx så
 * en uinnlogget besøker aldri ser en rå 500 (bug-prevention trap #5).
 */
export default function DemoError({
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
      context="demo-error-boundary"
    />
  );
}
