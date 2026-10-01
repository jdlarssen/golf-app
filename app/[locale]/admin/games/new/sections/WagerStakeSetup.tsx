'use client';

import { useTranslations } from 'next-intl';
import { FormSection, FormSectionText } from '@/components/ui/FormSection';
import { CARD_FIELD_CONTROL, CARD_FIELD_LABEL } from '@/components/ui/CardField';
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
    <FormSection legend={t('legend')}>
      <FormSectionText>{t('description', { unit })}</FormSectionText>
      <label className="block">
        <span className={CARD_FIELD_LABEL}>{t('krLabel', { unit })}</span>
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
          className={`${CARD_FIELD_CONTROL} border-field-border text-text`}
        />
      </label>
    </FormSection>
  );
}
