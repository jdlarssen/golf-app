'use client';

import { useTranslations } from 'next-intl';
import { FormSection, FormSectionHeading } from '@/components/ui/FormSection';
import { ChoiceCardGrid, RadioChoiceCard } from '@/components/ui/ChoiceCard';

export type NinesVariant = 'nines' | 'split_sixes';
export type NinesScoring = 'gross' | 'net';

interface NinesSetupProps {
  variant: NinesVariant;
  onVariantChange: (next: NinesVariant) => void;
  scoring: NinesScoring;
  onScoringChange: (next: NinesScoring) => void;
  disabled?: boolean;
}

/**
 * Nines / Split Sixes-spesifikk konfig som vises i wizardens step 2 når
 * game_mode='nines'.
 *
 * To kontroller:
 * - Variant: Nines (9 poeng per hull, 5–3–1) eller Split Sixes (6 poeng, 4–2–0).
 * - Scoring: Netto (handicap-justert) eller Brutto (rå slag). Default netto.
 *
 * Krever nøyaktig 3 spillere — validatoren (`validateNines` i gamePayload.ts)
 * håndhever dette ved publish.
 */
export function NinesSetup({
  variant,
  onVariantChange,
  scoring,
  onScoringChange,
  disabled = false,
}: NinesSetupProps) {
  const t = useTranslations('wizard.sections.nines');
  return (
    <FormSection legend={t('legend')}>
      <FormSectionHeading title={t('variantLabel')} />
      <ChoiceCardGrid columns={1} label={t('variantAriaLabel')}>
        <RadioChoiceCard
          name="nines_variant"
          value="nines"
          checked={variant === 'nines'}
          onChange={() => onVariantChange('nines')}
          disabled={disabled}
          title={t('variantNinesTitle')}
          hint={t('variantNinesDesc')}
        />
        <RadioChoiceCard
          name="nines_variant"
          value="split_sixes"
          checked={variant === 'split_sixes'}
          onChange={() => onVariantChange('split_sixes')}
          disabled={disabled}
          title={t('variantSplitSixesTitle')}
          hint={t('variantSplitSixesDesc')}
        />
      </ChoiceCardGrid>
      <FormSectionHeading title={t('scoringFromLabel')} />
      <ChoiceCardGrid columns={2} label={t('scoringAriaLabel')}>
        <RadioChoiceCard
          name="nines_scoring"
          value="net"
          checked={scoring === 'net'}
          onChange={() => onScoringChange('net')}
          disabled={disabled}
          title={t('scoringNetTitle')}
          hint={t('scoringNetDesc')}
          height={64}
        />
        <RadioChoiceCard
          name="nines_scoring"
          value="gross"
          checked={scoring === 'gross'}
          onChange={() => onScoringChange('gross')}
          disabled={disabled}
          title={t('scoringGrossTitle')}
          hint={t('scoringGrossDesc')}
          height={64}
        />
      </ChoiceCardGrid>
    </FormSection>
  );
}
