'use client';

import { useTranslations } from 'next-intl';
import type { SettlementUnitKey } from '@/lib/scoring/settlement';

/** Enheten kr-feltet gjelder per — samme nøkler som oppgjøret (#2221). */
export type WagerUnitKey = SettlementUnitKey;

interface WagerStakeSetupProps {
  /** Rå tekstverdi fra input-feltet; tom streng = av. */
  value: string;
  onChange: (next: string) => void;
  /** Hvilken enhet kr-verdien gjelder per (skin/poeng/seksjon). */
  unitKey: WagerUnitKey;
  disabled?: boolean;
}

/**
 * Delt «Penger på spill?»-oppsett (#937) som vises i wizardens step 2 for alle
 * veddemålsformatene (skins, wolf, nassau, bingo-bango-bongo, acey-deucey,
 * nines). Ett valgfritt kr-felt; tomt = uten penger. Feltet er kontrollert og
 * driver `krPerUnit`-state — den kanoniske submit-verdien sendes via et skjult
 * `kr_per_unit`-felt i GameWizard, så validatoren (parseKrPerUnit) leser den.
 */
export function WagerStakeSetup({
  value,
  onChange,
  unitKey,
  disabled = false,
}: WagerStakeSetupProps) {
  const t = useTranslations('wizard.sections.wager');
  const unit = t(`units.${unitKey}`);
  return (
    <fieldset className="space-y-3 rounded-md border border-border bg-surface px-4 py-4">
      <legend className="px-1 text-sm font-semibold text-text">
        {t('legend')}
      </legend>
      <p className="text-xs text-muted">{t('description', { unit })}</p>
      <label className="block">
        <span className="text-xs font-medium text-muted">
          {t('krLabel', { unit })}
        </span>
        <input
          type="number"
          inputMode="numeric"
          min={0}
          step={1}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          placeholder={t('placeholder')}
          aria-label={t('ariaLabel')}
          className="mt-1 w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-sm tabular-nums text-text focus:border-primary"
        />
      </label>
    </fieldset>
  );
}
