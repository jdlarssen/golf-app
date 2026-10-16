import type { useTranslations } from 'next-intl';
import type { AppLocale } from '@/i18n/routing';
import { formatListLocale } from '@/lib/i18n/format';
import type {
  TeeShotDeliveryAdvice,
  TeeShotHoleLine,
  TeeShotPlayerStatus,
  TeeShotStatus,
} from '@/lib/games/teeShots';

// The short names and the team order are shared with the app, so they live in
// lib/games/teeShotNames.ts; re-exported for the web's importers.
export { sortByTeeShotName, teeShotNames } from '@/lib/games/teeShotNames';

/**
 * «Hvem sitt utslag» (#2580): the web's sentences from the shared `teeShots.*`
 * templates in messages/*.json. Which names go where, their order and the
 * short form are decided in lib/games/teeShots.ts; this file only fills the
 * names into the templates and joins lists with `formatListLocale` (#2280).
 * The hole picker, the delivery box and the organiser's four pages use it.
 */

export type TeeShotT = ReturnType<typeof useTranslations<'teeShots'>>;
export type NameOf = (userId: string) => string;

/** «Per mangler 4, Jonas 3 og Sigrid 2». */
export function shortListText(
  short: readonly TeeShotPlayerStatus[],
  nameOf: NameOf,
  t: TeeShotT,
  locale: AppLocale,
): string {
  const parts = short.map((p, i) =>
    i === 0
      ? t('shortFirst', { name: nameOf(p.userId), count: p.missing })
      : t('shortRest', { name: nameOf(p.userId), count: p.missing }),
  );
  return formatListLocale(parts, locale);
}

/** The line under the hole page's buttons, or null when there is none. */
export function teeShotHoleLineText(
  line: TeeShotHoleLine,
  nameOf: NameOf,
  t: TeeShotT,
  locale: AppLocale,
): string | null {
  switch (line.kind) {
    case 'none':
      return null;
    case 'partial':
      return t('partialLine');
    case 'free': {
      const first = line.short[0];
      const who =
        line.othersEach !== null && first
          ? t('othersEach', {
              first: t('shortFirst', { name: nameOf(first.userId), count: first.missing }),
              count: line.othersEach,
            })
          : shortListText(line.short, nameOf, t, locale);
      return t('freeLine', { who, holes: line.freeHoles });
    }
    case 'locked':
      return t('lockedLine', {
        names: formatListLocale(line.names.map(nameOf), locale),
        count: line.names.length,
        holes: line.holesLeft,
      });
    case 'teamShort':
    case 'teamShortMixed':
    case 'teamShortGone':
      return t('teamShortLine', {
        who: shortListText(line.short, nameOf, t, locale),
        holes: line.holesLeft,
        surplus: swapPlacesText(line.kind === 'teamShortGone' ? [] : line.surplus, line.kind !== 'teamShort', nameOf, t, locale),
      });
  }
}

/**
 * «Marte eller Jonas», and «… eller en som ikke er med på laget lenger» when
 * someone no longer on the team holds holes the team must swap (#2580).
 */
function swapPlacesText(
  surplus: readonly string[],
  alsoGone: boolean,
  nameOf: NameOf,
  t: TeeShotT,
  locale: AppLocale,
): string {
  const places = surplus.map(nameOf);
  if (alsoGone) places.push(t('goneMember'));
  return formatListLocale(places, locale, 'disjunction');
}

/** The delivery box (`Utslag-forslag-levering`): title and sentence. */
export function teeShotBoxText(
  advice: TeeShotDeliveryAdvice,
  status: TeeShotStatus,
  wholeTeamDelivers: boolean,
  nameOf: NameOf,
  t: TeeShotT,
  locale: AppLocale,
): { title: string; body: string } {
  const delivery = wholeTeamDelivers ? 'team' : 'each';
  const names = formatListLocale(advice.shortNames.map(nameOf), locale);
  const body =
    advice.kind === 'pickOpen'
      ? t('boxPickOpen', { min: status.minimum, delivery, names })
      : t('boxSwap', {
          min: status.minimum,
          delivery,
          names,
          holes: advice.holes,
          surplus: swapPlacesText(advice.surplus, advice.kind !== 'swap', nameOf, t, locale),
        });
  return {
    title: t('boxTitle', {
      who: shortListText(advice.short, nameOf, t, locale),
      total: status.totalShort,
    }),
    body,
  };
}

/** «Per har 2 av 4 utslag», one line per player under the minimum. */
export function teeShotOrganizerLines(status: TeeShotStatus, nameOf: NameOf, t: TeeShotT): string[] {
  return status.short.map((p) =>
    t('organizerLine', { name: nameOf(p.userId), count: p.count, min: status.minimum }),
  );
}

/** The count under a name: «2 av 4», or «har 4» once the minimum is reached. */
export function teeShotCountText(player: TeeShotPlayerStatus, minimum: number, t: TeeShotT): string {
  return player.missing > 0
    ? t('countShort', { count: player.count, min: minimum })
    : t('countReached', { count: player.count });
}
