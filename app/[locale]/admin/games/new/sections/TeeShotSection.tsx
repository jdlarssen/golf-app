'use client';

import { useId } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import type { AppLocale } from '@/i18n/routing';
import { FormSection } from '@/components/ui/FormSection';
import { SwitchRow } from '@/components/ui/Switch';
import { choiceStateClass } from '@/components/ui/ChoiceCard';
import { formatListLocale } from '@/lib/i18n/format';
import { deliveryCoversWholeTeam } from '@/lib/games/teamDelivery';
import {
  MIN_TEE_SHOTS_FIELD,
  MIN_TEE_SHOTS_OPTIONS,
  defaultMinTeeShots,
  freeHolesAtMinimum,
  infeasibleMinTeeShots,
  type MinTeeShots,
} from '@/lib/games/teeShots';
import type { GameMode } from '@/lib/scoring/modes/types';

interface TeeShotSectionProps {
  /** Texas, Ambrose, Florida or shamble: the help text follows the delivery. */
  mode: GameMode;
  teamSize: number;
  /** Null = the setting is off. */
  value: MinTeeShots | null;
  onChange: (next: MinTeeShots | null) => void;
  disabled?: boolean;
}

/**
 * «Hvem sitt utslag» (#2580) on step 2, under the team size (scramble family)
 * or under the shamble setup, as `Utslag-forslag-oppsett` and
 * `Utslag-forslag-shamble-oppsett` draw it: a switch row, then the minimum per
 * player as four tiles. A minimum that does not fit 18 holes for the team size
 * stands dashed with «går ikke» and cannot be picked.
 *
 * The tiles are buttons, so the value travels in a hidden field. The one that
 * counts is the always-mounted copy in GameWizard/GameForm: the wizard
 * unmounts the steps it does not show, so a publish from a later step would
 * lose a field that only lived here. The copy below holds the same controlled
 * value, so the two never disagree. Which options fit, the default and the
 * free holes all come from lib/games/teeShots.ts.
 */
export function TeeShotSection({ mode, teamSize, value, onChange, disabled = false }: TeeShotSectionProps) {
  const t = useTranslations('wizard.sections.teeShots');
  const locale = useLocale() as AppLocale;
  const headingId = useId();
  const unavailable = infeasibleMinTeeShots(teamSize);
  const help = deliveryCoversWholeTeam(mode) ? t('switchHelpTeamCard') : t('switchHelpEachCard');

  const notes: string[] = [];
  if (unavailable.length > 0) {
    notes.push(
      t('unavailableNote', {
        size: String(teamSize),
        options: formatListLocale(unavailable.map(String), locale),
      }),
    );
  }
  if (value !== null) {
    notes.push(t('freeNote', { min: value, free: freeHolesAtMinimum(value, teamSize) }));
  }

  return (
    <FormSection legend={t('legend')} variant="list">
      <SwitchRow
        title={t('switchTitle')}
        description={help}
        checked={value !== null}
        onChange={(event) => onChange(event.target.checked ? defaultMinTeeShots(teamSize) : null)}
        disabled={disabled}
      />
      {value !== null && (
        <div className="flex flex-col gap-2.5 p-3.5">
          <input type="hidden" name={MIN_TEE_SHOTS_FIELD} value={String(value)} />
          <p id={headingId} className="font-sans text-sm font-semibold leading-[normal] text-text">
            {t('minLabel')}
          </p>
          <div role="group" aria-labelledby={headingId} className="grid grid-cols-4 gap-2">
            {MIN_TEE_SHOTS_OPTIONS.map((option) => {
              const fits = !unavailable.includes(option);
              const selected = fits && value === option;
              const state = fits
                ? `cursor-pointer text-text ${choiceStateClass(selected)}`
                : 'border border-dashed border-slot-dashed bg-bg text-muted';
              return (
                <button
                  key={option}
                  type="button"
                  aria-pressed={selected}
                  disabled={disabled || !fits}
                  onClick={() => onChange(option)}
                  data-testid={`tee-shot-min-${option}`}
                  className={`flex min-h-[60px] flex-col items-center justify-center rounded-[14px] px-1.5 py-2 transition-colors duration-150 disabled:cursor-not-allowed ${
                    fits ? 'disabled:opacity-50' : ''
                  } ${state}`}
                >
                  <span className="font-serif text-[17px] font-semibold tabular-nums leading-[normal]">
                    {option}
                  </span>
                  <span className="mt-0.5 font-sans text-xs leading-[normal] text-muted">
                    {fits ? t('tileHint') : t('tileUnavailable')}
                  </span>
                </button>
              );
            })}
          </div>
          {notes.length > 0 && (
            <p className="font-sans text-xs leading-[1.4] text-muted">{notes.join(' ')}</p>
          )}
        </div>
      )}
    </FormSection>
  );
}
