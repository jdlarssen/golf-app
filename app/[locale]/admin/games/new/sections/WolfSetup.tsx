'use client';

import { useTranslations } from 'next-intl';

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
    <fieldset className="space-y-5 rounded-md border border-border bg-surface px-4 py-4">
      <legend className="px-1 text-sm font-semibold text-foreground">
        {t('legend')}
      </legend>

      <div>
        <p className="text-xs font-medium text-muted">{t('scoringLabel')}</p>
        <p className="mt-1 text-xs text-muted/80">
          {t('scoringDescription')}
        </p>
        <div className="mt-2 grid grid-cols-2 gap-2" role="radiogroup" aria-label={t('scoringAriaLabel')}>
          <label
            className={`flex cursor-pointer items-center justify-center rounded-md border px-3 py-2 text-xs font-medium transition ${
              scoring === 'net'
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border bg-surface-2 text-muted hover:border-primary/40'
            }`}
          >
            <input
              type="radio"
              name="wolf_scoring"
              value="net"
              checked={scoring === 'net'}
              onChange={() => onScoringChange('net')}
              disabled={disabled}
              className="sr-only"
            />
            {t('scoringNet')}
          </label>
          <label
            className={`flex cursor-pointer items-center justify-center rounded-md border px-3 py-2 text-xs font-medium transition ${
              scoring === 'gross'
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border bg-surface-2 text-muted hover:border-primary/40'
            }`}
          >
            <input
              type="radio"
              name="wolf_scoring"
              value="gross"
              checked={scoring === 'gross'}
              onChange={() => onScoringChange('gross')}
              disabled={disabled}
              className="sr-only"
            />
            {t('scoringGross')}
          </label>
        </div>
      </div>

      <p
        data-testid="wolf-start-note"
        className="text-xs text-muted/80"
      >
        {t('startNote')}
      </p>
    </fieldset>
  );
}
