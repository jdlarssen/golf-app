'use client';

import { useParams } from 'next/navigation';
import { ErrorScreen } from '@/components/ui/ErrorScreen';

/**
 * Error-grense for spillerens trekk-side (#1814, felle #5: ingen rute skal vise
 * en rå 500). Sidens lesninger går mot cup-snapshotet og deltaker-gaten — en
 * DB-blipp der skal lande her, ikke i Next.js sin engelske feilside.
 */
export default function CupWithdrawError({
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
      back={id ? { href: `/cup/${id}`, labelKey: 'toHome' } : { href: '/', labelKey: 'toHome' }}
      context="cup-withdraw-error-boundary"
    />
  );
}
