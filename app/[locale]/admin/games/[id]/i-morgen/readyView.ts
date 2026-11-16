import { eveningCounts, isTomorrowInOslo, type EveningRosterRow } from '@/lib/games/eveningBeforeRules';
import { flightBuckets, hasStartlista, isSingleFlightGame } from '@/lib/games/flightScope';
import { sharesFirstName } from '@/lib/firstName';
import { formatListLocale, formatRelativeDayLocale } from '@/lib/i18n/format';
import type { AppLocale } from '@/i18n/routing';
import type { GameMode } from '@/lib/scoring/modes/types';
import type { ReadyLink, ReadyRow } from './ReadyList';

// What «Klar for i morgen?» shows (#2483), put together from the round and its
// list. Pure: the page reads, this decides every row and word, `ReadyList`
// draws. `now` comes in, so nothing here reads the clock.

/** One player on the list, with the names the page shows. */
export type ReadyPerson = EveningRosterRow & {
  flight_number: number | null;
  /** «Kari Lund», or a masked address for a nameless player. */
  full: string;
  /** «Kari». */
  short: string;
};

/** A row as the page binds it: the reminder still a user id, not an action. */
export type ReadyViewRow = Omit<ReadyRow, 'remind'> & { remind?: { userId: string; name: string } | null };

type Translate = (key: string, values?: Record<string, string | number>) => string;

export function buildReadyView(input: {
  gameId: string;
  /** The game's name as the page shows it (`localizeGameName`). */
  title: string;
  status: string;
  gameMode: GameMode;
  teamSize: number;
  teeOffIso: string | null;
  courseName: string | null;
  teeName: string | null;
  /** «Planlagt», for the kicker of a round without a tee-off. */
  statusLabel: string;
  people: readonly ReadyPerson[];
  /** The first invitation per player who has not answered. */
  invitedAt: ReadonlyMap<string, string>;
  /** The player just reminded (`?purret=`). */
  purret: string | null;
  now: number;
  locale: AppLocale;
  /** `admin.game.tomorrow`. */
  t: Translate;
}): { heading: string; kicker: string; rows: ReadyViewRow[]; links: ReadyLink[] } {
  const { t, locale, people, now, gameId } = input;
  const teeOffAt = input.teeOffIso ? Date.parse(input.teeOffIso) : null;
  const tomorrow = input.teeOffIso != null && isTomorrowInOslo(input.teeOffIso, now);

  const byName = (a: ReadyPerson, b: ReadyPerson) => a.full.localeCompare(b.full, locale);
  const allFull = people.map((p) => p.full);
  // A first name two players share is shown in full (#2286).
  const label = (p: ReadyPerson) =>
    sharesFirstName(p.full, allFull.filter((f) => f !== p.full)) ? p.full : p.short;
  const names = (ps: readonly ReadyPerson[]) => formatListLocale([...ps].sort(byName).map(label), locale);

  const counts = eveningCounts(people);
  const rows: ReadyViewRow[] = [
    {
      key: 'confirmed',
      testId: 'ready-row-confirmed',
      tone: counts.confirmed.length > 0 ? 'ok' : 'warn',
      title:
        counts.unanswered.length === 0
          ? t('allConfirmed', { total: counts.total })
          : t('confirmed', { confirmed: counts.confirmed.length, total: counts.total }),
      sub: counts.confirmed.length > 0 ? names(counts.confirmed) : null,
    },
  ];

  for (const p of [...counts.unanswered].sort(byName)) {
    const invited = input.invitedAt.get(p.user_id);
    rows.push({
      key: `unanswered-${p.user_id}`,
      testId: 'ready-row-unanswered',
      tone: 'warn',
      title: t('unanswered', { name: p.full }),
      sub: invited ? t('invited', { when: formatRelativeDayLocale(invited, locale, now) }) : null,
      remind: { userId: p.user_id, name: p.short },
      purredLabel: input.purret === p.user_id ? t('purred') : null,
    });
  }

  rows.push({
    key: 'course',
    testId: 'ready-row-course',
    tone: input.courseName && teeOffAt != null ? 'ok' : 'warn',
    title: input.courseName
      ? input.teeName
        ? t('course', { course: input.courseName, tee: input.teeName })
        : input.courseName
      : t('noCourse'),
    sub: teeOffAt == null ? t('noTeeOff') : t(tomorrow ? 'teeOff' : 'teeOffDay', { teeOffAt }),
  });

  const startlista = hasStartlista(input.status, input.gameMode, input.teamSize, [...people]);
  rows.push(flightsRow(input, people, names, startlista));

  const links: ReadyLink[] = [];
  if (input.teeOffIso) {
    links.push({ key: 'move', href: `/games/${gameId}/flytt`, label: t('moveRound'), testId: 'ready-move-link' });
  }
  if (startlista) {
    links.push({
      key: 'startlista',
      href: `/admin/games/${gameId}/startlista`,
      label: t('seeStartlist'),
      testId: 'ready-startlista-link',
    });
  }

  return {
    heading: tomorrow ? t('headingTomorrow') : t('headingLater'),
    kicker:
      teeOffAt == null
        ? t('kickerNoTeeOff', { name: input.title, status: input.statusLabel })
        : t(tomorrow ? 'kickerTomorrow' : 'kickerLater', { name: input.title, teeOffAt }),
    rows,
    links,
  };
}

/**
 * The flights: each flight with its players, and how many are without one;
 * a round that is one flight by the rule (`isSingleFlightGame`) as «Én
 * flight»; else «Ingen flighter ennå», pointing to the Startlista when the
 * round has one.
 */
function flightsRow(
  input: { gameMode: GameMode; t: Translate },
  people: readonly ReadyPerson[],
  names: (ps: readonly ReadyPerson[]) => string,
  startlista: boolean,
): ReadyViewRow {
  const { t } = input;
  const { assigned, unassigned } = flightBuckets(people);
  const base = { key: 'flights', testId: 'ready-row-flights' };
  if (assigned.size > 0) {
    const lines = [...assigned.entries()]
      .sort(([a], [b]) => a - b)
      .map(([n, ps]) => t('flightLine', { n, names: names(ps) }));
    if (unassigned.length > 0) lines.push(t('unassigned', { count: unassigned.length }));
    return {
      ...base,
      tone: unassigned.length > 0 ? 'warn' : 'ok',
      title: t('flights', { count: assigned.size }),
      sub: lines.join(' · '),
    };
  }
  if (isSingleFlightGame(input.gameMode, [...people])) {
    return {
      ...base,
      tone: 'ok',
      title: t('flights', { count: 1 }),
      sub: names(people.filter((p) => p.withdrawn_at == null)),
    };
  }
  return { ...base, tone: 'warn', title: t('noFlights'), sub: startlista ? t('noFlightsHint') : null };
}
