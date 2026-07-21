'use client';

import { useSyncExternalStore } from 'react';
import { SmartLink } from '@/components/ui/SmartLink';

// Cookie-en endrer seg ikke mens spectate-siden er åpen, så subscribe er en
// no-op. getServerSnapshot returnerer false → CTA-en er synlig under SSR og
// første hydrering (ingen mismatch); klient-snapshotet skjuler den om en
// `sb-`-sesjonscookie finnes.
const subscribe = () => () => {};
const getSnapshot = () =>
  document.cookie.split(';').some((c) => c.trim().startsWith('sb-'));
const getServerSnapshot = () => false;

/**
 * «Lag din egen turnering»-CTA nederst på spectate-siden (#1268).
 *
 * Spectate-siden er bevisst auth-løs server-side (`/spectate` ligger i
 * `PUBLIC_PATH_PATTERN`, så proxyen hopper over auth-oppslaget) — besøkerens
 * innloggingsstatus er ukjent når serveren rendrer. Denne lille klient-øya
 * skjuler derfor CTA-en når en Supabase-auth-cookie finnes (`sb-`-prefiks),
 * så innloggede brukere ikke får en «lag konto»-oppfordring.
 *
 * Heuristikk, ingen nettverkskall: en innlogget bruker med utløpt sesjon kan i
 * verste fall se CTA-en kort — rent kosmetisk (ASSUMPTION, jf. kontrakt #1268).
 * Cookie-sjekken kjører i en effekt, så SSR + første render viser CTA-en
 * (bra for utloggede); innloggede får den fjernet straks JS kjører.
 */
export function SpectateCta({
  href,
  label,
}: {
  href: string;
  label: string;
}) {
  const hasSession = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );

  if (hasSession) return null;

  return (
    <div className="flex justify-center px-4 py-8">
      <SmartLink
        href={href}
        data-testid="spectate-cta"
        className="inline-flex min-h-[44px] items-center rounded-full bg-primary px-6 py-3 text-sm font-medium text-white shadow-sm transition-colors hover:bg-primary/90"
      >
        {label}
      </SmartLink>
    </div>
  );
}
