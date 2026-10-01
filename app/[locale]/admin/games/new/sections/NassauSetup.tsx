'use client';

import { useTranslations } from 'next-intl';
import { FormSection, FormSectionHeading } from '@/components/ui/FormSection';
import { ChoiceCardGrid, RadioChoiceCard } from '@/components/ui/ChoiceCard';

export type NassauScoring = 'gross' | 'net';

interface NassauSetupProps {
  scoring: NassauScoring;
  onScoringChange: (next: NassauScoring) => void;
  disabled?: boolean;
}

/**
 * Nassau-spesifikk konfig som vises i wizardens step 2 når game_mode='nassau'.
 *
 * Én kontroll: scoring-toggle (Med handicap (netto) vs Brutto). Default netto.
 * Default-net-fallback speiler Tørny's HCP-ethos. Validator (validateNassau i
 * gamePayload.ts) leser feltet og faller defensivt tilbake til 'net'.
 *
 * Ingen rotasjon eller spillertilordning her — Nassau er solo-format (2-16
 * spillere, #460), tee-up er identisk med soloStrokeplay.
 */
export function NassauSetup({ scoring, onScoringChange, disabled = false }: NassauSetupProps) {
  const t = useTranslations('wizard.sections.nassau');
  return (
    <FormSection legend={t('legend')}>
      <FormSectionHeading title={t('scoringLabel')} description={t('scoringDescription')} />
      <ChoiceCardGrid columns={2} label={t('scoringAriaLabel')}>
        <RadioChoiceCard
          name="nassau_scoring"
          value="net"
          checked={scoring === 'net'}
          onChange={() => onScoringChange('net')}
          disabled={disabled}
          title={t('scoringNet')}
        />
        <RadioChoiceCard
          name="nassau_scoring"
          value="gross"
          checked={scoring === 'gross'}
          onChange={() => onScoringChange('gross')}
          disabled={disabled}
          title={t('scoringGross')}
        />
      </ChoiceCardGrid>
    </FormSection>
  );
}
