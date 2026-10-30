'use client';

/**
 * PlayerSourceChoice — step 4's «Hvordan får dere spillere?» (#2447): the
 * organiser says how the players come before building the list. «Jeg velger
 * dem nå» keeps the list required; the two sign-up modes make it optional
 * (`playersStepOptional`), so «Neste: Klar?» is open without anyone picked.
 *
 * It reads and writes `registrationMode` like `RegistrationSection` does for
 * «Rediger spill», and both read the same `modeInvite*` / `modeApproval*` /
 * `modeOpen*` keys, so the words have one home. Not drawn for a club
 * tournament: membership is the invitation there (#643).
 */

import { Fragment, useId } from 'react';
import { useTranslations } from 'next-intl';
import type { GameFormState } from '../useGameFormState';
import type { RegistrationMode } from '@/lib/games/registration';
import { choiceStateClass } from '@/components/ui/ChoiceCard';
import { CheckRow } from '@/components/ui/CheckRow';

const MODES: readonly RegistrationMode[] = ['invite_only', 'manual_approval', 'open'] as const;

export function PlayerSourceChoice({ state }: { state: GameFormState }) {
  const t = useTranslations('wizard.sections.registration');
  const tWizard = useTranslations('wizard');
  const labelId = useId();
  const { registrationMode, setRegistrationMode, lockGameMode, letFriendsSkipGate, setLetFriendsSkipGate } =
    state;

  function title(mode: RegistrationMode): string {
    if (mode === 'invite_only') return t('modeInviteTitle');
    if (mode === 'manual_approval') return t('modeApprovalTitle');
    return t('modeOpenTitle');
  }

  function hint(mode: RegistrationMode): string {
    if (mode === 'invite_only') return t('modeInviteHint');
    if (mode === 'manual_approval') return t('modeApprovalHint');
    return t('modeOpenHint');
  }

  return (
    <div className="px-1 pb-1">
      {/* The step title names the group for screen readers; the heading
          above already shows it, so this one stays out of sight. */}
      <p id={labelId} className="sr-only">
        {tWizard('stepTitle.4source')}
      </p>
      <div role="radiogroup" aria-labelledby={labelId} className="flex flex-col gap-2">
        {MODES.map((mode) => {
          const checked = registrationMode === mode;
          return (
            <Fragment key={mode}>
              <label
                className={`flex min-h-[76px] cursor-pointer flex-col justify-center rounded-2xl px-4 py-3 text-left text-text transition-colors duration-150 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50 ${choiceStateClass(checked)}`}
              >
                <input
                  type="radio"
                  name="registration_mode_input"
                  value={mode}
                  checked={checked}
                  onChange={() => setRegistrationMode(mode)}
                  disabled={lockGameMode}
                  className="sr-only"
                />
                <span className="font-serif text-[18px] font-semibold leading-[normal]">
                  {title(mode)}
                </span>
                <span className="mt-0.5 font-sans text-[13px] leading-[1.4] text-muted">
                  {hint(mode)}
                </span>
              </label>
              {mode === 'manual_approval' && checked && (
                <CheckRow
                  className="ml-7"
                  title={t('friendsSkipTitle')}
                  description={t('friendsSkipHint')}
                  checked={letFriendsSkipGate}
                  onChange={(e) => setLetFriendsSkipGate(e.target.checked)}
                  disabled={lockGameMode}
                />
              )}
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}
