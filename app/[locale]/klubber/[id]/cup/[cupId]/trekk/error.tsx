'use client';

import { useParams } from 'next/navigation';
import { ErrorScreen } from '@/components/ui/ErrorScreen';

/**
 * Error-grense for klubb-variantens trekk-side (#1814, felle #5). «Tilbake»
 * holder klubb-styreren i klubb-chrome.
 */
export default function KlubbCupWithdrawError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  const params = useParams<{ id?: string; cupId?: string }>();
  const groupId = typeof params?.id === 'string' ? params.id : undefined;
  const cupId = typeof params?.cupId === 'string' ? params.cupId : undefined;

  return (
    <ErrorScreen
      error={error}
      retry={unstable_retry}
      back={
        groupId && cupId
          ? { href: `/klubber/${groupId}/cup/${cupId}`, labelKey: 'toHome' }
          : { href: '/', labelKey: 'toHome' }
      }
      context="klubb-cup-withdraw-error-boundary"
    />
  );
}
