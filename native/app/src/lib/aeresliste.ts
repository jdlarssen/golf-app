// #2894 PR 2: det Æreslista og banneret på Hjem viser, regnet ut av svaret fra
// `/api/aeresliste`. Ren, så skjermen og banneret bare tegner.
//
// Rekkefølgen er serverens (`buildAeresliste`): de nyeste først, uansett slag. Årene
// grupperes i den rekkefølgen, så innenfor året står også de nyeste først. Radene er de
// samme som i kortet «Sjeldne slag» (`momentRow`).
//
// **Banneret** viser det nyeste slaget når det ble spilt for under 7 dager siden. Dagen
// er kalenderdagen: `playedOn` er Oslo-dagen fra serveren, og «i dag» er telefonens dag
// (Hermes har ikke Oslo-sonen, se `homeDates.ts`). Har flere slag kommet i de samme 7
// dagene, sier pillen «+1 til». Et lukket slag (`closedKey`) gir ikke banner igjen.
import { formatLongDateNb, formatShortDateNb } from '../../../../lib/format/date';
import { ACHIEVEMENT_MARKS, RARE_MOMENT_MARK_KEY } from '../../../../lib/stats/achievementMarks';
import type { AereslisteRow, AereslisteView } from '../../../../lib/stats/aeresliste';
import { localDate, momentRow, type MomentRowModel } from './toppliste';
import { topplisteT } from './topplisteCopy';

/** Banneret står så mange dager etter runden (kontrakten: «7 dager etter runden»). */
export const BANNER_DAYS = 7;

const KIND_KEY = {
  hole_in_one: 'momentHoleInOne',
  albatross: 'momentAlbatross',
} as const;

const NEWEST_KEY = {
  hole_in_one: 'aeresNewestHoleInOne',
  albatross: 'aeresNewestAlbatross',
} as const;

export type AereslisteHeroModel = {
  /** «Nyeste hole-in-one». */
  label: string;
  name: string;
  /** «Hull 7 på Bogstad · 21. sep». */
  line: string;
  mark: string;
  spoken: string;
};

export type AereslisteYearModel = {
  year: string;
  /** «2 hole-in-one · 1 albatross». */
  count: string;
  rows: MomentRowModel[];
};

export type AereslisteModel =
  | { kind: 'empty' }
  | { kind: 'list'; hero: AereslisteHeroModel; years: AereslisteYearModel[] };

function where(row: Pick<AereslisteRow, 'hole' | 'courseName'>): string {
  return row.courseName
    ? topplisteT('aeresWhere', { hole: row.hole, course: row.courseName })
    : topplisteT('aeresWhereNoCourse', { hole: row.hole });
}

/** «2 hole-in-one · 1 albatross»; et slag uten noen i året står ikke. */
export function yearCount(rows: readonly AereslisteRow[]): string {
  const holeInOne = rows.filter((r) => r.kind === 'hole_in_one').length;
  const albatross = rows.length - holeInOne;
  return [
    holeInOne > 0 ? topplisteT('aeresCountHoleInOne', { count: holeInOne }) : null,
    albatross > 0 ? topplisteT('aeresCountAlbatross', { count: albatross }) : null,
  ]
    .filter((part): part is string => part !== null)
    .join(' · ');
}

function hero(row: AereslisteRow): AereslisteHeroModel {
  const label = topplisteT(NEWEST_KEY[row.kind]);
  const date = localDate(row.playedOn);
  const spoken = row.courseName
    ? topplisteT('aeresHeroSpoken', { label, name: row.name, hole: row.hole, course: row.courseName, date: formatLongDateNb(date) })
    : topplisteT('aeresHeroSpokenNoCourse', { label, name: row.name, hole: row.hole, date: formatLongDateNb(date) });
  return {
    label,
    name: row.name,
    line: `${where(row)} · ${formatShortDateNb(date)}`,
    mark: ACHIEVEMENT_MARKS[RARE_MOMENT_MARK_KEY[row.kind]],
    spoken: row.isViewer ? `${spoken}, ${topplisteT('youSpoken')}` : spoken,
  };
}

export function buildAereslisteModel(view: AereslisteView): AereslisteModel {
  if (view.rows.length === 0) return { kind: 'empty' };
  const byYear = new Map<string, AereslisteRow[]>();
  for (const row of view.rows) {
    const year = row.playedOn.slice(0, 4);
    byYear.set(year, [...(byYear.get(year) ?? []), row]);
  }
  return {
    kind: 'list',
    hero: hero(view.rows[0]),
    years: [...byYear].map(([year, rows]) => ({ year, count: yearCount(rows), rows: rows.map(momentRow) })),
  };
}

/** Kalenderdagen som løpenummer; `Date.UTC` er bare tabellen (som `homeDates.ts`). */
function dayNumber(year: number, month: number, day: number): number {
  return Math.floor(Date.UTC(year, month, day) / 86_400_000);
}

/** Hvor mange kalenderdager siden runden, med telefonens «i dag». */
export function daysSincePlayed(playedOn: string, now: Date): number {
  const [year, month, day] = playedOn.split('-').map(Number);
  return dayNumber(now.getFullYear(), now.getMonth(), now.getDate()) - dayNumber(year, month - 1, day);
}

export type RareShotBannerModel = {
  key: string;
  mark: string;
  /** «Hole-in-one», «Albatross». */
  shot: string;
  name: string;
  isViewer: boolean;
  /** «Hull 7 på Bogstad». */
  where: string;
  /** «+1 til» når flere slag kom de samme 7 dagene, ellers `null`. */
  more: string | null;
  spoken: string;
};

export function buildRareShotBanner(
  rows: readonly AereslisteRow[],
  now: Date,
  closedKey: string | null,
): RareShotBannerModel | null {
  const recent = rows.filter((row) => daysSincePlayed(row.playedOn, now) < BANNER_DAYS);
  const newest = recent[0];
  if (!newest || newest.key === closedKey) return null;
  const shot = topplisteT(KIND_KEY[newest.kind]);
  const name = newest.isViewer ? `${newest.name}, ${topplisteT('youSpoken')}` : newest.name;
  return {
    key: newest.key,
    mark: ACHIEVEMENT_MARKS[RARE_MOMENT_MARK_KEY[newest.kind]],
    shot,
    name: newest.name,
    isViewer: newest.isViewer,
    where: where(newest),
    more: recent.length > 1 ? topplisteT('bannerMore', { count: recent.length - 1 }) : null,
    spoken: newest.courseName
      ? topplisteT('bannerSpoken', { kind: shot, name, hole: newest.hole, course: newest.courseName })
      : topplisteT('bannerSpokenNoCourse', { kind: shot, name, hole: newest.hole }),
  };
}
