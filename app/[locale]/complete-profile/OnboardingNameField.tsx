'use client';

import { useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
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
 *
 * `onNameChange` (#2350) holder forhåndsvisningen «Slik ser de andre deg» i
 * takt: den kalles ved hver endring, og én gang når demo-navnet er skrevet inn
 * (da rendrer forelderen én gang til — feltet selv er fortsatt urørt av state).
 */
export function OnboardingNameField({
  initialName = '',
  onNameChange,
}: {
  initialName?: string;
  onNameChange?: (name: string) => void;
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
        onNameChange?.(stored);
      }
    } catch {
      // localStorage utilgjengelig (privat modus) — behold dagens tomme felt.
    }
    // Én gang ved mount: forslaget er engangs, og en ny `onNameChange`-
    // referanse skal ikke lese nøkkelen på nytt.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialName]);

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor="name" className="text-sm leading-[normal] font-semibold text-text">
        {t('nameLabel')}
      </label>
      {/* The border is the focus mark (artboard «Profilstart-forslag»): 1.5 px
          forest instead of the global ring. That ring is deliberately
          unlayered (#1386, app/globals.css) and beats every utility in
          `@layer utilities`, so a plain `focus-visible:outline-none` does
          nothing — the `!` makes it an important declaration, which wins. */}
      <input
        ref={inputRef}
        id="name"
        name="name"
        type="text"
        autoComplete="name"
        defaultValue={initialName}
        required
        aria-describedby="name-hint"
        onChange={(e) => onNameChange?.(e.target.value)}
        className="h-[54px] w-full rounded-xl border border-border bg-surface px-3.5 text-base text-text focus-visible:border-[1.5px] focus-visible:border-primary focus-visible:outline-none!"
      />
      <p id="name-hint" className="text-xs leading-[normal] text-muted">
        {t('nameHint')}
      </p>
    </div>
  );
}
