'use client';

import { useTranslations } from 'next-intl';

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
    <fieldset className="space-y-3 rounded-md border border-border bg-surface px-4 py-4">
      <legend className="px-1 text-sm font-semibold text-foreground">
        {t('legend')}
      </legend>

      <div>
        <p className="text-xs font-medium text-muted">{t('scoringLabel')}</p>
        <p className="mt-1 text-xs text-muted/80">
          {t('scoringDescription')}
        </p>
        <div
          className="mt-2 grid grid-cols-2 gap-2"
          role="radiogroup"
          aria-label={t('scoringAriaLabel')}
        >
          <label
            className={`flex cursor-pointer items-center justify-center rounded-md border px-3 py-2 text-xs font-medium transition ${
              scoring === 'net'
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border bg-surface-2 text-muted hover:border-primary/40'
            }`}
          >
            <input
              type="radio"
              name="acey_deucey_scoring"
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
              name="acey_deucey_scoring"
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
    </fieldset>
  );
}
