'use client';

import { ErrorScreen } from '@/components/ui/ErrorScreen';

/**
 * Catch-all error-grense for `[locale]`-segmentet (#680). Fanger alt under
 * locale-layouten som ikke fanges av en mer spesifikk grense — inkludert feil i
 * `games/[id]/layout.tsx` (som game-grensen ikke dekker). Feil i selve
 * `[locale]/layout.tsx` bobler videre til `app/global-error.tsx`.
 */
export default function LocaleError({
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
      context="locale-error-boundary"
    />
  );
}
