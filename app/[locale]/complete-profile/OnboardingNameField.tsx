'use client';

import { useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { Input } from '@/components/ui/Input';
import { DEMO_NAME_STORAGE_KEY } from '@/lib/demo/handoff';

/**
 * Navn-feltet i onboarding. En liten klient-øy slik at navnet besøkeren satte i
 * prøvespill-demoen (#1173) kan prefylles fra localStorage ved mount.
 *
 * Feltet er ukontrollert (`defaultValue`) med en ref: demo-navnet skrives rett i
 * DOM-en én gang etter mount — ingen `setState` i effekt (unngår kaskade-render)
 * og ingen hydration-mismatch. Echo-verdi fra en valideringsbounce (#748) vinner
 * alltid: er `initialName` satt, rører vi ikke localStorage. Forslaget er
 * engangs — vi leser og sletter nøkkelen, og brukeren kan fritt endre feltet.
 */
export function OnboardingNameField({
  initialName = '',
}: {
  initialName?: string;
}) {
  const t = useTranslations('onboarding');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // #748-echo vinner over demo-forslaget — da lar vi feltet stå som det er.
    if (initialName) return;
    try {
      const stored = window.localStorage.getItem(DEMO_NAME_STORAGE_KEY);
      if (stored && inputRef.current) {
        inputRef.current.value = stored;
        window.localStorage.removeItem(DEMO_NAME_STORAGE_KEY);
      }
    } catch {
      // localStorage utilgjengelig (privat modus) — behold dagens tomme felt.
    }
  }, [initialName]);

  return (
    <Input
      ref={inputRef}
      id="name"
      name="name"
      type="text"
      label={t('nameLabel')}
      autoComplete="name"
      defaultValue={initialName}
      required
    />
  );
}
