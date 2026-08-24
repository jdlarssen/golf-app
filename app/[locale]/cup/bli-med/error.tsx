'use client';

import { ErrorScreen } from '@/components/ui/ErrorScreen';

/**
 * Error-grense for den delbare cup-påmeldingen (#1490, AGENTS.md-felle 5:
 * hver rute trenger en `error.tsx` så en spiller aldri møter en rå 500).
 *
 * Ligger på `bli-med`-nivået, ikke på `[shortId]`, så den dekker enhver
 * shortId. En ukjent kode er ikke en feil her — den gir `notFound()` og den
 * merkede 404-en; dette fanger det uventede: Supabase-hikke i oppslagene eller
 * en throw fra en av de fire parallelle lesingene.
 */
export default function CupBliMedError({
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
      context="cup-bli-med-error-boundary"
    />
  );
}
