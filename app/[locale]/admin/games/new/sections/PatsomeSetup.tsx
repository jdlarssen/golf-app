'use client';

import { useTranslations } from 'next-intl';
import { FormSection, FormSectionHeading } from '@/components/ui/FormSection';
import { ChoiceCardGrid, RadioChoiceCard } from '@/components/ui/ChoiceCard';

export type PatsomeScoring = 'gross' | 'net';

interface PatsomeSetupProps {
  scoring: PatsomeScoring;
  onScoringChange: (next: PatsomeScoring) => void;
  disabled?: boolean;
}

const SEGMENTS = [1, 2, 3] as const;

/**
 * Patsome-spesifikk konfig som vises i wizardens step 2 når game_mode='patsome'.
 *
 * Patsome er et rotasjonsformat for lag à 2 der 18 hull deles i tre
 * 6-hulls-segmenter med ulik spillform:
 * - Hull 1–6: 4BBB — begge spiller egen ball, beste stableford-poeng per hull teller.
 * - Hull 7–12: Greensome — begge slår ut, laget velger beste drive, deretter annenhver.
 * - Hull 13–18: Foursomes — ekte annenhver fra tee.
 *
 * Lagets samlede resultat er summen av stableford-poeng fra alle tre segmentene.
 *
 * Kontroll:
 * - Scoring: Netto (WHS-justert per segment) eller Brutto (rå slag). Default netto.
 *
 * Krever lag à 2, minst 2 lag (minst 4 spillere) — validatoren
 * (`validatePatsome` i gamePayload.ts) håndhever dette ved publish.
 */
export function PatsomeSetup({
  scoring,
  onScoringChange,
  disabled = false,
}: PatsomeSetupProps) {
  const t = useTranslations('wizard.sections.patsome');
  return (
    <FormSection legend={t('legend')}>
      {/* Forklaring av de tre segmentene: hullene i en kolonne, formatet i halvfet. */}
      <div className="flex flex-col gap-2.5 rounded-xl bg-surface-2 p-3">
        {SEGMENTS.map((n) => (
          <p key={n} className="flex gap-2.5">
            <span className="min-w-[74px] whitespace-nowrap font-serif text-[13px] font-semibold leading-[normal] text-text">
              {t(`segment${n}Holes`)}
            </span>
            <span className="font-sans text-[13px] leading-[1.45] text-text">
              <span className="font-semibold">{t(`segment${n}Format`)}</span> {t(`segment${n}Body`)}
            </span>
          </p>
        ))}
      </div>
      <p className="font-sans text-xs leading-[1.45] text-muted">{t('handicapNote')}</p>
      <FormSectionHeading title={t('scoringFromLabel')} />
      <ChoiceCardGrid columns={2} label={t('scoringAriaLabel')}>
        <RadioChoiceCard
          name="patsome_scoring"
          value="net"
          checked={scoring === 'net'}
          onChange={() => onScoringChange('net')}
          disabled={disabled}
          title={t('scoringNetTitle')}
          hint={t('scoringNetDesc')}
        />
        <RadioChoiceCard
          name="patsome_scoring"
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
