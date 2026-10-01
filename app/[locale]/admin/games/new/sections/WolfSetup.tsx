'use client';

import { useTranslations } from 'next-intl';
import { FormSection, FormSectionHeading } from '@/components/ui/FormSection';
import { ChoiceCardGrid, RadioChoiceCard } from '@/components/ui/ChoiceCard';

export type WolfScoring = 'gross' | 'net';

interface WolfSetupProps {
  scoring: WolfScoring;
  onScoringChange: (next: WolfScoring) => void;
  disabled?: boolean;
}

/**
 * Wolf-spesifikk konfig som vises i wizardens step 2 når game_mode='wolf'.
 *
 * Én kontroll:
 *  - Scoring-toggle: 'Med handicap (netto)' vs 'Brutto'. Default netto.
 *
 * Rotasjons-rekkefølgen trekkes automatisk ved oppstart av spillet (#969).
 */
export function WolfSetup({
  scoring,
  onScoringChange,
  disabled = false,
}: WolfSetupProps) {
  const t = useTranslations('wizard.sections.wolf');

  return (
    <FormSection legend={t('legend')}>
      <FormSectionHeading title={t('scoringLabel')} description={t('scoringDescription')} />
      <ChoiceCardGrid columns={2} label={t('scoringAriaLabel')}>
        <RadioChoiceCard
          name="wolf_scoring"
          value="net"
          checked={scoring === 'net'}
          onChange={() => onScoringChange('net')}
          disabled={disabled}
          title={t('scoringNet')}
        />
        <RadioChoiceCard
          name="wolf_scoring"
          value="gross"
          checked={scoring === 'gross'}
          onChange={() => onScoringChange('gross')}
          disabled={disabled}
          title={t('scoringGross')}
        />
      </ChoiceCardGrid>
      <p data-testid="wolf-start-note" className="font-sans text-xs leading-[normal] text-muted">
        {t('startNote')}
      </p>
    </FormSection>
  );
}
