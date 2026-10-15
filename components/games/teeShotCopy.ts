import type { useTranslations } from 'next-intl';
import type { AppLocale } from '@/i18n/routing';
import { formatListLocale } from '@/lib/i18n/format';
import { firstName, sharesFirstName } from '@/lib/firstName';
import type {
  TeeShotDeliveryAdvice,
  TeeShotHoleLine,
  TeeShotPlayerStatus,
  TeeShotStatus,
} from '@/lib/games/teeShots';

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
      return t('teamShortLine', {
        who: shortListText(line.short, nameOf, t, locale),
        holes: line.holesLeft,
        surplus: formatListLocale(line.surplus.map(nameOf), locale, 'disjunction'),
      });
  }
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
    advice.kind === 'swap'
      ? t('boxSwap', {
          min: status.minimum,
          delivery,
          names,
          holes: advice.holes,
          surplus: formatListLocale(advice.surplus.map(nameOf), locale, 'disjunction'),
        })
      : t('boxPickOpen', { min: status.minimum, delivery, names });
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

/**
 * Short names for a team, as the artboards write them: the nickname, else the
 * first name, and the full name when two on the team share a first name
 * (#2286). `members` is the team in team order.
 */
export function teeShotNames(
  members: readonly {
    user_id: string;
    users?: { name: string | null; nickname: string | null } | null;
  }[],
  unknownPlayer: string,
): Map<string, string> {
  const fullNames = members.map((m) => m.users?.name ?? null);
  return new Map(
    members.map((m, i) => {
      const nickname = m.users?.nickname?.trim();
      const fullName = fullNames[i] ?? null;
      const others = fullNames.filter((_, j) => j !== i);
      const name =
        nickname || (sharesFirstName(fullName, others) ? fullName : firstName(fullName)) || unknownPlayer;
      return [m.user_id, name];
    }),
  );
}

/**
 * The team order every tee-shot surface uses: by short name (Norwegian
 * collation), then by id. PostgREST returns `game_players` in no set order, and
 * a delivered row can move, so without this the buttons, the lock line («Sigrid
 * og Per trenger …») and the box would shuffle between page loads.
 */
export function sortByTeeShotName<
  T extends { user_id: string; users?: { name: string | null; nickname: string | null } | null },
>(members: readonly T[], unknownPlayer: string): T[] {
  const names = teeShotNames(members, unknownPlayer);
  return [...members].sort(
    (a, b) =>
      (names.get(a.user_id) ?? '').localeCompare(names.get(b.user_id) ?? '', 'nb') ||
      a.user_id.localeCompare(b.user_id),
  );
}
