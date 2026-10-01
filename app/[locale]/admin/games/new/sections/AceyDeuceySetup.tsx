'use client';

import { useTranslations } from 'next-intl';
import { FormSection, FormSectionHeading } from '@/components/ui/FormSection';
import { ChoiceCardGrid, RadioChoiceCard } from '@/components/ui/ChoiceCard';

export type AceyDeuceyScoring = 'gross' | 'net';

interface AceyDeuceySetupProps {
  scoring: AceyDeuceyScoring;
  onScoringChange: (next: AceyDeuceyScoring) => void;
  disabled?: boolean;
}

/**
 * Acey Deucey-spesifikk konfig som vises i wizardens step 2 når
 * game_mode='acey_deucey'.
 *
 * Én kontroll: scoring-toggle (Med handicap (netto) vs Brutto). Default netto.
 * Default-net-fallback speiler Tørnys HCP-ethos og sikrer at en høy-
 * handikapper ikke alltid ender som «deuce». Validator (validateAceyDeucey
 * i gamePayload.ts) leser feltet og faller defensivt tilbake til 'net'.
 *
 * Acey Deucey er et solo-format for nøyaktig 4 spillere — ingen lag her.
 * Formfeltet heter 'acey_deucey_scoring' — speiler parseAceyDeuceyScoring().
 */
export function AceyDeuceySetup({
  scoring,
  onScoringChange,
  disabled = false,
}: AceyDeuceySetupProps) {
  const t = useTranslations('wizard.sections.aceyDeucey');
  return (
    <FormSection legend={t('legend')}>
      <FormSectionHeading title={t('scoringLabel')} description={t('scoringDescription')} />
      <ChoiceCardGrid columns={2} label={t('scoringAriaLabel')}>
        <RadioChoiceCard
          name="acey_deucey_scoring"
          value="net"
          checked={scoring === 'net'}
          onChange={() => onScoringChange('net')}
          disabled={disabled}
          title={t('scoringNet')}
        />
        <RadioChoiceCard
          name="acey_deucey_scoring"
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
