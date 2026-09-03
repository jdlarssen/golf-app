'use client';

import { useParams } from 'next/navigation';
import { ErrorScreen } from '@/components/ui/ErrorScreen';

/**
 * Error-grense for arrangørens trekk-side (#1814, felle #5). Leser cup-id fra
 * ruta så «tilbake» lander på cup-styringen, ikke på forsiden.
 */
export default function AdminCupWithdrawError({
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
      back={
        id ? { href: `/admin/cup/${id}`, labelKey: 'toHome' } : { href: '/', labelKey: 'toHome' }
      }
      context="admin-cup-withdraw-error-boundary"
    />
  );
}
