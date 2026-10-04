'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { HCP_MAX } from '@/lib/users/profileInput';

/**
 * Handicap-felt for onboarding: magnitude-input + «+»-knapp for plusshandicap
 * (spilleren slipper å taste fortegn på mobil). Sender `hcp_index` (magnitude)
 * + `hcp_plus`; server-actionen regner ut signert verdi. Fortegns-logikken bor
 * i `lib/handicap/sign`. Hva verdien blir hos de andre, viser forhåndsvisningen
 * under (#2350), via `onChange`.
 *
 * `initialMagnitude`/`initialPlus` brukes til å gjenopprette verdier etter
 * en valideringsfeil-redirect (#748) — `defaultValue` alene er ikke nok fordi
 * React bruker `useState`-initialiserings-verdien, ikke DOM-attributten, for
 * kontrollerte inputs.
 */
export function OnboardingHcpField({
  initialMagnitude = '',
  initialPlus = false,
  onChange,
}: {
  initialMagnitude?: string;
  initialPlus?: boolean;
  onChange?: (value: { magnitude: string; isPlus: boolean }) => void;
}) {
  const [magnitude, setMagnitude] = useState(initialMagnitude);
  const [isPlus, setIsPlus] = useState(initialPlus);
  const t = useTranslations('onboarding');

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor="hcp_index" className="text-sm leading-[normal] font-semibold text-text">
        {t('hcpLabel')}
      </label>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => {
            const next = !isPlus;
            setIsPlus(next);
            onChange?.({ magnitude, isPlus: next });
          }}
          aria-pressed={isPlus}
          aria-label={t('hcpPlusLabel')}
          className={`flex size-[52px] shrink-0 items-center justify-center rounded-xl border text-lg leading-[normal] font-semibold transition-colors duration-150 ${
            isPlus
              ? 'border-primary bg-primary-soft text-text shadow-[inset_0_0_0_1px_var(--primary)]'
              : 'border-border bg-surface text-muted hover:text-text'
          }`}
        >
          +
        </button>
        <input
          id="hcp_index"
          name="hcp_index"
          type="number"
          inputMode="decimal"
          step="0.1"
          min={0}
          max={HCP_MAX}
          required
          value={magnitude}
          aria-describedby="hcp_index-hint"
          onChange={(e) => {
            setMagnitude(e.target.value);
            onChange?.({ magnitude: e.target.value, isPlus });
          }}
          className="score-num h-[54px] min-w-0 flex-1 rounded-xl border border-border bg-surface px-3.5 text-[22px] text-text"
        />
      </div>
      <input type="hidden" name="hcp_plus" value={isPlus ? 'on' : ''} />
      <p id="hcp_index-hint" className="text-xs leading-[normal] text-muted">
        {t('hcpGolfboxHelper', { max: HCP_MAX })}
      </p>
    </div>
  );
}
