'use client';

import { useTranslations } from 'next-intl';
import { FormSection, FormSectionHeading } from '@/components/ui/FormSection';
import { ChoiceCardGrid, RadioChoiceCard } from '@/components/ui/ChoiceCard';

export type ShambleVariant = 'shamble' | 'champagne';
export type ShambleCount = 1 | 2 | 3;
export type ShambleScoring = 'gross' | 'net';

interface ShambleSetupProps {
  variant: ShambleVariant;
  onVariantChange: (next: ShambleVariant) => void;
  count: ShambleCount;
  onCountChange: (next: ShambleCount) => void;
  scoring: ShambleScoring;
  onScoringChange: (next: ShambleScoring) => void;
  /** Lagstørrelse: 3 eller 4. Styres av ShambleSetup sin egen velger. */
  teamSize: 3 | 4;
  onTeamSizeChange: (next: 3 | 4) => void;
  disabled?: boolean;
}

/**
 * Shamble / Champagne Scramble-spesifikk konfig i wizardens steg 2 når
 * game_mode='shamble'.
 *
 * Fire kontrollgrupper:
 * - Lagstørrelse: 3- eller 4-mannslag.
 * - Variant: Shamble (best 2 låst) eller Champagne Scramble (velg antall).
 * - Antall som teller: kun synlig ved Champagne Scramble (1 / 2 / 3).
 * - Tellemåte: Netto (default) eller Brutto.
 *
 * Lag-størrelse 3 er ny i Tørny — validatoren (`validateShamble` i
 * gamePayload.ts) håndhever at alle lag har eksakt teamSize spillere ved
 * publish. Shamble-preset låser count til 2 server-side.
 */
export function ShambleSetup({
  variant,
  onVariantChange,
  count,
  onCountChange,
  scoring,
  onScoringChange,
  teamSize,
  onTeamSizeChange,
  disabled = false,
}: ShambleSetupProps) {
  const t = useTranslations('wizard.sections.shamble');
  return (
    <FormSection legend={t('legend')}>
      <FormSectionHeading title={t('teamSizeLabel')} />
      <ChoiceCardGrid columns={2} label={t('teamSizeAriaLabel')}>
        <RadioChoiceCard
          name="shamble_team_size"
          value="3"
          checked={teamSize === 3}
          onChange={() => onTeamSizeChange(3)}
          disabled={disabled}
          title={t('teamSize3Title')}
          hint={t('teamSize3Desc')}
          height={64}
        />
        <RadioChoiceCard
          name="shamble_team_size"
          value="4"
          checked={teamSize === 4}
          onChange={() => onTeamSizeChange(4)}
          disabled={disabled}
          title={t('teamSize4Title')}
          hint={t('teamSize4Desc')}
          height={64}
        />
      </ChoiceCardGrid>
      <FormSectionHeading title={t('variantLabel')} />
      <ChoiceCardGrid columns={2} label={t('variantAriaLabel')}>
        <RadioChoiceCard
          name="shamble_variant"
          value="shamble"
          checked={variant === 'shamble'}
          onChange={() => onVariantChange('shamble')}
          disabled={disabled}
          title={t('variantShambleTitle')}
          hint={t('variantShambleDesc')}
          height={64}
        />
        <RadioChoiceCard
          name="shamble_variant"
          value="champagne"
          checked={variant === 'champagne'}
          onChange={() => onVariantChange('champagne')}
          disabled={disabled}
          title={t('variantChampagneTitle')}
          hint={t('variantChampagneDesc')}
          height={64}
        />
      </ChoiceCardGrid>
      {/* Antall som teller — kun synlig ved Champagne Scramble */}
      {variant === 'champagne' && (
        <>
          <FormSectionHeading title={t('countLabel')} />
          <ChoiceCardGrid columns={3} label={t('countAriaLabel')}>
            {([1, 2, 3] as const).map((n) => (
              <RadioChoiceCard
                key={n}
                name="shamble_count"
                value={String(n)}
                checked={count === n}
                onChange={() => onCountChange(n)}
                disabled={disabled}
                title={n}
                hint={n === 1 ? t('countSingle') : t('countPlural')}
                layout="centered"
              />
            ))}
          </ChoiceCardGrid>
        </>
      )}
      <FormSectionHeading title={t('scoringLabel')} />
      <ChoiceCardGrid columns={2} label={t('scoringAriaLabel')}>
        <RadioChoiceCard
          name="shamble_scoring"
          value="net"
          checked={scoring === 'net'}
          onChange={() => onScoringChange('net')}
          disabled={disabled}
          title={t('scoringNetTitle')}
          hint={t('scoringNetDesc')}
        />
        <RadioChoiceCard
          name="shamble_scoring"
          value="gross"
          checked={scoring === 'gross'}
          onChange={() => onScoringChange('gross')}
          disabled={disabled}
          title={t('scoringGrossTitle')}
          hint={t('scoringGrossDesc')}
        />
      </ChoiceCardGrid>
    </FormSection>
  );
}
