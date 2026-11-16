'use client';

/**
 * «Plasser og frist» (#2482), on step 5 «Klar?» and in «Rediger» under
 * «Påmelding». Three rows, as the artboard draws them
 * (`Nyttspill-forslag-plasser-*`, row 63 of the design canvas):
 *
 *   - Antall plasser with − and +: the organiser's cap, «4 flights à 4» under
 *     it when it goes up in fours. Not on matchplay, which fills per side.
 *   - Påmeldingsfrist with «Endre»: a bottom sheet with the date and time.
 *   - Venteliste når det er fullt: only on open signup with a cap to fill.
 *
 * The card writes state only. The form posts it through the always-mounted
 * hidden inputs (`registrationCapForSave`, `signupDeadline`,
 * `waitlistEnabled`; #1011), and gamePayload decides what is stored.
 */

import { useId, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import type { GameFormState } from '../useGameFormState';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Kicker } from '@/components/ui/Kicker';
import { SwitchRow } from '@/components/ui/Switch';
import { formatTeeOffLongDate } from '@/lib/format/teeOff';
import { formatOsloDateTimeLocal, parseOsloDateTimeLocal } from '@/lib/games/gamePayload';
import { effectiveRegistrationCap, organizerCapBounds } from '@/lib/wizard/fitsPlayerCount';
import { teeOffIso } from './readyChecklistRules';
import { capStep, flightsOfFour } from './seatsAndDeadlineRules';

const ROW = 'flex items-center gap-3 px-3.5 py-2.5 border-b border-row-divider-warm';
const ROUND_BUTTON =
  'flex h-11 w-11 items-center justify-center rounded-full border border-border bg-surface font-sans text-xl text-text disabled:opacity-40';

function deadlineIso(local: string): string | null {
  if (local === '') return null;
  try {
    return parseOsloDateTimeLocal(local);
  } catch {
    return null;
  }
}

export function SeatsAndDeadlineCard({ state, kicker = true }: { state: GameFormState; kicker?: boolean }) {
  const t = useTranslations('wizard.ready.seatsAndDeadline');
  const tSettings = useTranslations('wizard.ready.settings');
  const locale = useLocale();
  const titleId = useId();
  const [sheetOpen, setSheetOpen] = useState(false);
  const {
    gameMode,
    teamSize,
    registrationMode,
    registrationCapForSave: cap,
    setRegistrationCap,
    signupDeadline,
    setSignupDeadline,
    waitlistEnabled,
    setWaitlistEnabled,
    scheduledTeeOffAt,
  } = state;

  const bounds = organizerCapBounds(gameMode, { team_size: teamSize });
  const flights = flightsOfFour(cap);
  // The list needs a round that can fill: open signup with a cap, the
  // organiser's or the format's.
  const showsWaitlist =
    registrationMode === 'open' &&
    effectiveRegistrationCap(gameMode, { team_size: teamSize }, cap) !== null;

  const deadlineText = formatTeeOffLongDate(signupDeadline, locale);
  const deadlineAt = deadlineIso(signupDeadline);
  const teeOffAt = teeOffIso(scheduledTeeOffAt);
  // U13: the server refuses it too; this line says why before the tap.
  const deadlineAfterTeeOff =
    deadlineAt !== null && teeOffAt !== null && new Date(deadlineAt) > new Date(teeOffAt);

  return (
    <>
      {kicker && (
        <Kicker id={titleId} className="px-1 pt-[18px] pb-2 leading-[normal]">
          {t('kicker')}
        </Kicker>
      )}
      <div
        data-testid="seats-and-deadline"
        role="group"
        aria-labelledby={kicker ? titleId : undefined}
        aria-label={kicker ? undefined : t('kicker')}
        className="overflow-hidden rounded-2xl border border-border bg-surface"
      >
        {bounds && (
          <div className={`${ROW} min-h-16`}>
            <span className="min-w-0 flex-1">
              <span className="block font-sans text-[15px] leading-[normal] font-semibold text-text">
                {t('seatsTitle')}
              </span>
              {/* AC 2: the flights only when the cap goes up in fours; else the
                  number stands alone. */}
              {(cap === null || flights !== null) && (
                <span className="mt-0.5 block font-sans text-xs leading-[normal] text-muted">
                  {cap === null ? t('seatsNone') : t('seatsFlights', { flights: flights! })}
                </span>
              )}
            </span>
            <span className="flex items-center gap-2.5">
              <button
                type="button"
                aria-label={t('seatsLess')}
                data-testid="seats-less"
                disabled={cap === null}
                onClick={() => setRegistrationCap(capStep(cap, -1, bounds))}
                className={ROUND_BUTTON}
              >
                −
              </button>
              <span
                aria-live="polite"
                data-testid="seats-value"
                className="min-w-7 text-center font-serif text-[22px] font-semibold tabular-nums text-text"
              >
                {cap ?? '–'}
              </span>
              <button
                type="button"
                aria-label={t('seatsMore')}
                data-testid="seats-more"
                disabled={cap !== null && cap >= bounds.max}
                onClick={() => setRegistrationCap(capStep(cap, 1, bounds))}
                className={ROUND_BUTTON}
              >
                +
              </button>
            </span>
          </div>
        )}

        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          data-testid="deadline-row"
          className={`${ROW} min-h-14 w-full text-left ${showsWaitlist ? '' : 'border-b-0'}`}
        >
          <span className="min-w-0 flex-1">
            <span className="block font-sans text-[15px] leading-[normal] font-semibold text-text">
              {t('deadlineTitle')}
            </span>{' '}
            <span
              className={`mt-0.5 block font-sans text-xs leading-[normal] ${
                deadlineAfterTeeOff ? 'font-semibold text-warning-text' : 'text-muted'
              }`}
            >
              {deadlineText
                ? deadlineText.charAt(0).toLocaleUpperCase(locale) + deadlineText.slice(1)
                : t('deadlineNone')}
              {deadlineAfterTeeOff ? ` · ${t('deadlineAfterTeeOff')}` : ''}
            </span>
          </span>{' '}
          <span className="shrink-0 font-sans text-[13px] leading-[normal] font-semibold text-primary">
            {tSettings('edit')}
          </span>
        </button>

        {showsWaitlist && (
          <SwitchRow
            title={t('waitlistTitle')}
            description={t('waitlistHint')}
            checked={waitlistEnabled}
            onChange={(e) => setWaitlistEnabled(e.target.checked)}
          />
        )}
      </div>

      <BottomSheet
        open={sheetOpen}
        title={t('deadlineTitle')}
        onClose={() => setSheetOpen(false)}
        doneLabel={tSettings('done')}
        closeLabel={tSettings('close')}
      >
        <div className="flex flex-col gap-3">
          <Input
            variant="card"
            id="signup-deadline"
            label={t('deadlineLabel')}
            type="datetime-local"
            value={signupDeadline}
            min={sheetOpen ? formatOsloDateTimeLocal(new Date().toISOString()) : undefined}
            onChange={(e) => setSignupDeadline(e.target.value)}
            hint={t('deadlineHint')}
          />
          {signupDeadline !== '' && (
            <Button
              type="button"
              size="chip"
              variant="quiet"
              className="self-start"
              onClick={() => setSignupDeadline('')}
            >
              {t('deadlineRemove')}
            </Button>
          )}
        </div>
      </BottomSheet>
    </>
  );
}
