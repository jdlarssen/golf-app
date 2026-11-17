'use client';

/**
 * «Slik ser det ut for den som melder seg på» on «Klar?» (#2482, the owner's
 * answer 17.11: «Nei, bygg den»), under «Plasser og frist», as the artboard
 * draws it (`Nyttspill-forslag-plasser-*`, row 63): the round's name and time,
 * then what a player meets on the signup page the moment the round is full.
 *
 * It draws the signup page's own parts with the organiser's values, so the
 * two can never say different things: `SeatsLine` with every seat taken and,
 * with the waiting list on, nobody on it yet, and the label of the button that
 * page shows on a full round («Sett meg på ventelista», or «Send forespørsel»
 * without the list). Nothing here can be tapped. No preview without a cap:
 * then the round never fills.
 */

import { useLocale, useTranslations } from 'next-intl';
import type { AppLocale } from '@/i18n/routing';
import { Kicker } from '@/components/ui/Kicker';
import { SeatsLine } from '@/app/[locale]/signup/[shortId]/SeatsLine';
import type { RegistrationMode } from '@/lib/games/registration';
import { formatDate, formatShortDayMonthLocale, formatTeeOffTimeLocale } from '@/lib/i18n/format';
import type { GameMode } from '@/lib/scoring/modes/types';
import { effectiveRegistrationCap } from '@/lib/wizard/fitsPlayerCount';

export function SignupPreviewCard({
  name,
  teeOffIso,
  gameMode,
  teamSize,
  cap,
  registrationMode,
  waitlistEnabled,
}: {
  name: string;
  teeOffIso: string | null;
  gameMode: GameMode;
  teamSize: number;
  /** The organiser's cap as the form saves it (`registrationCapForSave`). */
  cap: number | null;
  registrationMode: RegistrationMode;
  waitlistEnabled: boolean;
}) {
  const t = useTranslations('wizard.ready.signupPreview');
  const tSignup = useTranslations('signup');
  const locale = useLocale() as AppLocale;

  const seats = effectiveRegistrationCap(gameMode, { team_size: teamSize }, cap);
  if (seats === null) return null;
  const withList = registrationMode === 'open' && waitlistEnabled;

  const d = teeOffIso ? new Date(teeOffIso) : null;
  const when =
    d && !Number.isNaN(d.getTime())
      ? `${formatDate(d, locale, { timeZone: 'Europe/Oslo', weekday: 'short' })} ${formatShortDayMonthLocale(d, locale)} · ${formatTeeOffTimeLocale(d, locale)}`
      : null;

  return (
    <>
      <Kicker id="signup-preview-kicker" className="px-1 pt-[18px] pb-2 leading-[normal]">
        {t('kicker')}
      </Kicker>
      <figure
        data-testid="signup-preview"
        aria-labelledby="signup-preview-kicker"
        className="m-0 flex flex-col gap-2 rounded-2xl border border-border bg-surface px-3.5 py-3"
      >
        <div className="flex items-baseline justify-between gap-3">
          <span className="min-w-0 truncate font-serif text-lg leading-[normal] font-semibold text-text">
            {name.trim() || t('nameFallback')}
          </span>
          {when && <span className="shrink-0 font-sans text-xs text-muted tabular-nums">{when}</span>}
        </div>
        <SeatsLine seats={{ kind: 'capped', cap: seats, held: seats, ...(withList ? { waitlist: 0 } : {}) }} />
        <span
          data-testid="signup-preview-button"
          className="flex h-11 items-center justify-center rounded-full border border-primary bg-surface font-sans text-sm font-semibold text-primary"
        >
          {withList ? tSignup('joinWaitlistButton') : tSignup('sendRequestButton')}
        </span>
      </figure>
    </>
  );
}
