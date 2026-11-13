'use client';

import { useParams } from 'next/navigation';
import { ErrorScreen } from '@/components/ui/ErrorScreen';

/**
 * Error boundary for /klubber/[id]/medlemmer (#2326, trap 5). «Tilbake» goes to the club page.
 */
export default function KlubbMedlemmerError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  const params = useParams<{ id?: string }>();
  const groupId = typeof params?.id === 'string' ? params.id : undefined;

  return (
    <ErrorScreen
      error={error}
      retry={unstable_retry}
      back={groupId ? { href: `/klubber/${groupId}`, labelKey: 'toHome' } : { href: '/', labelKey: 'toHome' }}
      context="klubb-medlemmer-error-boundary"
    />
  );
}
