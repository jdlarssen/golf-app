'use client';

import { useParams } from 'next/navigation';
import { ErrorScreen } from '@/components/ui/ErrorScreen';

/**
 * Error boundary for the prize-giving remote (#2298). A failed read of the
 * result or the game state shows the retry screen with a way back to the game,
 * never a raw 500.
 */
export default function CeremonyError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  const params = useParams<{ id?: string }>();
  const id = typeof params?.id === 'string' ? params.id : undefined;

  return (
    <ErrorScreen
      error={error}
      retry={unstable_retry}
      back={id ? { href: `/games/${id}`, labelKey: 'toGame' } : { href: '/', labelKey: 'toHome' }}
      context="ceremony-error-boundary"
    />
  );
}
