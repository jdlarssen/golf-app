'use client';

import { ErrorScreen } from '@/components/ui/ErrorScreen';

/**
 * Error-grense for profil-segmentet (#867). Fanger ukontrollerte throws fra
 * profilsiden og undersidene — f.eks. Supabase-feil i `ProfileFormCard`.
 * Feil i selve `[locale]/profile/layout.tsx` bobler videre til
 * `[locale]/error.tsx` (catch-all). «Til profil» bringer brukeren tilbake til
 * profilroten; `unstable_retry` re-fetcher segmentet (Next 16.2+), ikke bare
 * re-mounter klienten. Deler chromen med game- og catch-all-grensene via
 * `ErrorScreen`.
 */
export default function ProfileError({
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
      back={{ href: '/profile', labelKey: 'toProfile' }}
      context="profile-error-boundary"
    />
  );
}
