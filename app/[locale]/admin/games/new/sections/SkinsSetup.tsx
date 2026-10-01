'use client';

import { useTranslations } from 'next-intl';
import { FormSection, FormSectionHeading } from '@/components/ui/FormSection';
import { ChoiceCardGrid, RadioChoiceCard } from '@/components/ui/ChoiceCard';

export type SkinsScoring = 'gross' | 'net';

interface SkinsSetupProps {
  scoring: SkinsScoring;
  onScoringChange: (next: SkinsScoring) => void;
  disabled?: boolean;
}

/**
 * Skins-spesifikk konfig som vises i wizardens step 2 når game_mode='skins'.
 *
 * Én kontroll: scoring-toggle (Med handicap (netto) vs Brutto). Default netto.
 * Default-net-fallback speiler Tørny's HCP-ethos. Validator (validateSkins i
 * gamePayload.ts) leser feltet og faller defensivt tilbake til 'net'.
 *
 * Skins er et solo-format (2–16 spillere, #460) — ingen rotasjon eller lagoppsett her.
 * Carryover er alltid på: delte hull ruller skinnet videre til neste hull, som
 * da er verdt mer. Ingen toggle — det er selve formatet.
 */
export function SkinsSetup({ scoring, onScoringChange, disabled = false }: SkinsSetupProps) {
  const t = useTranslations('wizard.sections.skins');
  return (
    <FormSection legend={t('legend')}>
      <FormSectionHeading title={t('scoringLabel')} description={t('scoringDescription')} />
      <ChoiceCardGrid columns={2} label={t('scoringAriaLabel')}>
        <RadioChoiceCard
          name="skins_scoring"
          value="net"
          checked={scoring === 'net'}
          onChange={() => onScoringChange('net')}
          disabled={disabled}
          title={t('scoringNet')}
        />
        <RadioChoiceCard
          name="skins_scoring"
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
