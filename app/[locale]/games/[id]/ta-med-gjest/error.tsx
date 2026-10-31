'use client';

import { useParams } from 'next/navigation';
import { ErrorScreen } from '@/components/ui/ErrorScreen';

/**
 * Error boundary for «Ta med en gjest» (#2607, AGENTS.md trap 5): the page
 * creates a guest, so a thrown read never reaches the player as a raw 500.
 * «Til spillet» goes back to the game page.
 */
export default function BringGuestError({
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
      context="bring-guest-error-boundary"
    />
  );
}
