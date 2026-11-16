'use client';

import { useParams } from 'next/navigation';
import { ErrorScreen } from '@/components/ui/ErrorScreen';

/**
 * Error boundary for «Klar for i morgen?» (#2483, AGENTS.md trap 5): the page
 * reads the list with the admin client and «Purr» sends a reminder, so a
 * thrown read never reaches the organiser as a raw 500. «Til spillet» goes
 * back to the game page.
 */
export default function TomorrowError({
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
      context="tomorrow-error-boundary"
    />
  );
}
