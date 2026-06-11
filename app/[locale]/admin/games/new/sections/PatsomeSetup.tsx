'use client';

import { useTranslations } from 'next-intl';

export type PatsomeScoring = 'gross' | 'net';

interface PatsomeSetupProps {
  scoring: PatsomeScoring;
  onScoringChange: (next: PatsomeScoring) => void;
  disabled?: boolean;
}

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
    <fieldset className="space-y-4 rounded-md border border-border bg-surface px-4 py-4">
      <legend className="px-1 text-sm font-semibold text-foreground">
        {t('legend')}
      </legend>

      {/* Forklaring av de tre segmentene */}
      <div className="rounded-md bg-surface-2 px-3 py-2.5 text-xs text-muted space-y-1">
        <p>
          <span className="font-medium text-foreground">{t('segment1Heading')}</span>{' '}
          {t('segment1Body')}
        </p>
        <p>
          <span className="font-medium text-foreground">{t('segment2Heading')}</span>{' '}
          {t('segment2Body')}
        </p>
        <p>
          <span className="font-medium text-foreground">{t('segment3Heading')}</span>{' '}
          {t('segment3Body')}
        </p>
        <p className="pt-0.5">
          {t('handicapNote')}
        </p>
      </div>

      {/* Scoring-velger */}
      <div>
        <p className="text-xs font-medium text-muted">{t('scoringFromLabel')}</p>
        <div className="mt-2 grid grid-cols-2 gap-2" role="radiogroup" aria-label={t('scoringAriaLabel')}>
          <label
            className={`flex cursor-pointer flex-col items-start gap-0.5 rounded-md border px-3 py-2 transition ${
              scoring === 'net'
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border bg-surface-2 text-muted hover:border-primary/40'
            }`}
          >
            <input
              type="radio"
              name="patsome_scoring"
              value="net"
              checked={scoring === 'net'}
              onChange={() => onScoringChange('net')}
              disabled={disabled}
              className="sr-only"
            />
            <span className="text-xs font-medium">{t('scoringNetTitle')}</span>
            <span className="text-[11px] text-muted/80">{t('scoringNetDesc')}</span>
          </label>
          <label
            className={`flex cursor-pointer flex-col items-start gap-0.5 rounded-md border px-3 py-2 transition ${
              scoring === 'gross'
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border bg-surface-2 text-muted hover:border-primary/40'
            }`}
          >
            <input
              type="radio"
              name="patsome_scoring"
              value="gross"
              checked={scoring === 'gross'}
              onChange={() => onScoringChange('gross')}
              disabled={disabled}
              className="sr-only"
            />
            <span className="text-xs font-medium">{t('scoringGrossTitle')}</span>
            <span className="text-[11px] text-muted/80">{t('scoringGrossDesc')}</span>
          </label>
        </div>
      </div>
    </fieldset>
  );
}
