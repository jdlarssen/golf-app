'use client';

import { ErrorScreen } from '@/components/ui/ErrorScreen';

/**
 * Feil-grense for spill-embedden (#1024). Fanger ukontrollerte throws fra
 * server-komponenten (f.eks. DB-feil etter token-oppslag) så en klubbside
 * aldri viser en rå 500 inne i iframen.
 */
export default function EmbedGameError({
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
      context="embed-game-error-boundary"
    />
  );
}
