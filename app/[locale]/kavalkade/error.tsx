'use client';

import { ErrorScreen } from '@/components/ui/ErrorScreen';

/**
 * Error-grense for Kavalkaden (#2129, felle 5 i `docs/bug-prevention.md`).
 *
 * `getOrCreateKavalkade` kaster med vilje på databasefeil i stedet for å
 * defaulte til «ingen rad» (#877) — og en 0-rads skriving som ikke skyldes et
 * kappløp er også et kast. Uten denne grensen ville spilleren sett en rå 500 på
 * første åpning julaften morgen. `unstable_retry` re-fetcher segmentet, som er
 * riktig svar på en forbigående Supabase-hikke.
 */
export default function KavalkadeError({
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
      context="kavalkade-error-boundary"
    />
  );
}
