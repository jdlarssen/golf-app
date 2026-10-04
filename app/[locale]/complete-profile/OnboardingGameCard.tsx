import { useId } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import type { AppLocale } from '@/i18n/routing';
import { osloParts } from '@/lib/format/teeOff';
import {
  formatShortDayMonthLocale,
  formatTeeOffTimeLocale,
  shortMonthLocale,
} from '@/lib/i18n/format';
import { localizeGameName } from '@/lib/games/autoGameName';
import { formatDisplayLabelKey } from '@/lib/games/formatLabel';
import type { GameMode } from '@/lib/scoring/modes/types';
import type { OnboardingGameCardData } from './getOnboardingGame';

/**
 * «Lørdagsrunden venter på deg» on «Fullfør profilen» (#2350, artboard
 * «Profilstart-forslag»): the round from `next=/games/<id>`, on forest. Pure
 * presentation — the page decides whether there is a card at all.
 *
 * The date tile is decoration (`aria-hidden`); a screen reader gets the date
 * as text instead. Everything date-like is Oslo wall clock, since the page
 * renders on the UTC server. Without a tee-off there is no tile and no «kl.».
 */
export function OnboardingGameCard({ game }: { game: OnboardingGameCardData }) {
  const t = useTranslations('onboarding.game');
  const tModes = useTranslations('modes');
  const locale = useLocale() as AppLocale;
  const headingId = useId();

  const teeOff = game.teeOffAt ? new Date(game.teeOffAt) : null;
  const validTeeOff = teeOff && !Number.isNaN(teeOff.getTime()) ? teeOff : null;
  const parts = validTeeOff ? osloParts(validTeeOff) : null;

  const modeKey = formatDisplayLabelKey(game.gameMode as GameMode, game.modeConfig) as Parameters<
    typeof tModes
  >[0];
  const modeName = tModes.has(modeKey) ? tModes(modeKey) : null;
  const line = [
    game.courseName,
    validTeeOff ? t('teeOffAt', { time: formatTeeOffTimeLocale(validTeeOff, locale) }) : null,
    modeName,
  ]
    .filter((part): part is string => !!part)
    .join(' · ');

  return (
    <section
      aria-labelledby={headingId}
      data-testid="onboarding-game-card"
      className="mx-4 mt-3.5 flex items-center gap-3 rounded-2xl bg-surface-strong p-3.5 text-on-strong"
    >
      {validTeeOff && parts && (
        <>
          <span
            aria-hidden="true"
            data-testid="onboarding-game-date"
            className="flex size-11 shrink-0 flex-col items-center justify-center rounded-xl bg-on-strong/12"
          >
            <span className="score-num text-[18px] leading-none">{parts.day}</span>
            <span className="text-[9px] leading-[normal] font-semibold tracking-[0.12em] uppercase">
              {shortMonthLocale(parts.month, locale)}
            </span>
          </span>
          <span className="sr-only">{formatShortDayMonthLocale(validTeeOff, locale)}</span>
        </>
      )}
      <div className="min-w-0 text-[14px] leading-[1.4]">
        <h2 id={headingId} className="font-semibold">
          {t('title', { name: localizeGameName(game.name, game.courseName, locale) })}
        </h2>
        {line && <p className="text-on-strong/85">{line}</p>}
      </div>
    </section>
  );
}
