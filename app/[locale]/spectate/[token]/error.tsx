'use client';

import { ErrorScreen } from '@/components/ui/ErrorScreen';

/**
 * Feil-grense for den offentlige spectate-ruten (#938). Fanger ukontrollerte
 * throws fra server-komponenten (f.eks. DB-feil etter token-oppslag).
 * Brukere ser aldri en rå 500 — de får en vennlig melding i stedet.
 */
export default function SpectateError({
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
      context="spectate-error-boundary"
    />
  );
}
