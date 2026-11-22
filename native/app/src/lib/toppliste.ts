// #2259 PR 2: det Topplista viser, regnet ut av svaret fra `/api/aeresbrett`.
//
// Plassene, delt plass og «til topp 5» er serverens (`lib/stats/aeresbrett.ts`).
// Her står bare det skjermen gjør med dem: lederkortet (bare når én har plass 1,
// på alle tre fanene), «Du er på …»-linja, strekene mot lederen, medaljene på
// plass 1–3 og tekstene i hver tilstand. Ren, så skjermen bare tegner.
import { formatLongDateNb, formatShortDateNb } from '../../../../lib/format/date';
import {
  ACHIEVEMENT_MARKS,
  RARE_MOMENT_MARK_KEY,
  type RareMomentKind,
} from '../../../../lib/stats/achievementMarks';
import type {
  AeresbrettMe,
  AeresbrettMoment,
  AeresbrettRow,
  AeresbrettView,
} from '../../../../lib/stats/appAeresbrettView';
import { topplisteT } from './topplisteCopy';

export type TopplisteTab = 'wins' | 'birdies' | 'rounds';

/** Fanenes rekkefølge, som i tegningen. */
export const TOPPLISTE_TABS: readonly TopplisteTab[] = ['wins', 'birdies', 'rounds'];

export type TopplisteMedal = 'gold' | 'silver' | 'bronze';

const COUNT_KEY = { wins: 'winsCount', birdies: 'birdiesCount', rounds: 'roundsCount' } as const;
const UNIT_KEY = { wins: 'winsUnit', birdies: 'birdiesUnit', rounds: 'roundsUnit' } as const;
const NONE_KEY = {
  wins: ['noneWins', 'noneWinsBody', 'noneWinsOver'],
  birdies: ['noneBirdies', 'noneBirdiesBody', 'noneBirdiesOver'],
  rounds: ['noneRounds', 'noneRoundsBody', 'noneRoundsOver'],
} as const;

/** «6 seire», «1 birdie», «31 runder». */
export function countText(tab: TopplisteTab, count: number): string {
  return topplisteT(COUNT_KEY[tab], { count });
}

/** Tallet og enheten hver for seg, til lederkortets store tall. */
export function formatTopplisteCount(tab: TopplisteTab, count: number): { value: string; unit: string } {
  return { value: String(count), unit: topplisteT(UNIT_KEY[tab], { count }) };
}

export type TopplisteRowModel = {
  place: number;
  name: string;
  count: number;
  /** Streken mot lederen, 4–100 %. */
  barPercent: number;
  medal: TopplisteMedal | null;
  isViewer: boolean;
  /** «1. plass, Marte L., 6 seire», og «, deg» på din egen rad. */
  spoken: string;
};

export type TopplisteLeaderModel = {
  label: string;
  name: string;
  initials: string;
  value: string;
  unit: string;
};

export type TopplisteYouModel = {
  initials: string;
  title: string;
  detail: string;
};

export type TopplisteModel =
  | {
      kind: 'board';
      subtitle: string;
      leader: TopplisteLeaderModel | null;
      you: TopplisteYouModel | null;
      rows: TopplisteRowModel[];
    }
  | { kind: 'empty' | 'birdiesFailed'; subtitle: string; heading: string; body: string };

const MEDALS: readonly TopplisteMedal[] = ['gold', 'silver', 'bronze'];

function medalFor(place: number): TopplisteMedal | null {
  return place >= 1 && place <= 3 ? MEDALS[place - 1] : null;
}

function rowModel(tab: TopplisteTab, row: AeresbrettRow, top: number): TopplisteRowModel {
  const count = countText(tab, row.count);
  const spoken = topplisteT('place', { place: row.place, name: row.name, count });
  return {
    place: row.place,
    name: row.name,
    count: row.count,
    barPercent: Math.max(4, Math.round((row.count / top) * 100)),
    medal: medalFor(row.place),
    isViewer: row.isViewer,
    spoken: row.isViewer ? `${spoken}, ${topplisteT('youSpoken')}` : spoken,
  };
}

function youModel(
  tab: TopplisteTab,
  me: AeresbrettMe | null,
  initials: string,
  view: AeresbrettView,
): TopplisteYouModel {
  if (me === null) {
    const [none, body, over] = NONE_KEY[tab];
    return view.seasonOver
      ? { initials, title: topplisteT(over, { year: view.seasonYear ?? '' }), detail: topplisteT('noneOverBody') }
      : { initials, title: topplisteT(none), detail: topplisteT(body) };
  }
  const count = countText(tab, me.count);
  const detail =
    me.toTop5 !== null && !view.seasonOver
      ? `${count} · ${topplisteT('toTop5', { count: countText(tab, me.toTop5) })}`
      : count;
  return { initials, title: topplisteT('youPlace', { place: me.place }), detail };
}

/**
 * Det én fane viser. `selfInitials` er profilens initialer: din egen rad har dem
 * selv, men står du utenfor topp 10, finnes de bare der.
 */
export function buildTopplisteModel(
  view: AeresbrettView,
  tab: TopplisteTab,
  opts: { selfInitials?: string; now?: Date } = {},
): TopplisteModel {
  if (view.seasonYear === null) {
    const year = (opts.now ?? new Date()).getFullYear();
    return {
      kind: 'empty',
      subtitle: topplisteT('subtitleSeason', { year }),
      heading: topplisteT('emptyHeading'),
      body: topplisteT('emptyBody'),
    };
  }
  const subtitle = topplisteT('subtitleSeason', { year: view.seasonYear });
  const board = view.boards[tab];
  if (board === null) {
    return {
      kind: 'birdiesFailed',
      subtitle,
      heading: topplisteT('birdiesFailedHeading'),
      body: topplisteT('birdiesFailedBody'),
    };
  }

  const top = Math.max(1, board.rows[0]?.count ?? 1);
  const rows = board.rows.map((row) => rowModel(tab, row, top));
  const first = board.rows.filter((row) => row.place === 1);
  const leader =
    first.length === 1
      ? {
          label: view.seasonOver
            ? topplisteT('leaderOver', { year: view.seasonYear })
            : topplisteT('leaderRunning'),
          name: first[0].name,
          initials: first[0].initials,
          ...formatTopplisteCount(tab, first[0].count),
        }
      : null;
  const own = board.rows.find((row) => row.isViewer);
  const initials = own?.initials ?? opts.selfInitials ?? '?';
  return { kind: 'board', subtitle, leader, you: youModel(tab, board.me, initials, view), rows };
}

/** Kortet viser så mange rader før «Vis alle N». */
export const MOMENTS_VISIBLE = 5;

const MOMENT_KIND_KEY = {
  hole_in_one: 'momentHoleInOne',
  albatross: 'momentAlbatross',
  eagle: 'momentEagle',
} as const satisfies Record<RareMomentKind, 'momentHoleInOne' | 'momentAlbatross' | 'momentEagle'>;

export type MomentRowModel = {
  /** «1», «−3» eller «−2», golfens eget tall i ringen. */
  mark: string;
  name: string;
  isViewer: boolean;
  /** «Hole-in-one», «Albatross», «Eagle». */
  shot: string;
  /** « · hull 7 på Bogstad». */
  where: string;
  /** «12. jun». */
  date: string;
  /** «Hole-in-one, Jonas B., hull 7 på Bogstad, 12. juni», og «, deg» på din egen rad. */
  spoken: string;
};

export type MomentsModel = {
  title: string;
  subtitle: string;
  /** `failed`: bare kortet sier fra. `empty`: ingen slag. `list`: radene. */
  state: 'failed' | 'empty' | 'list';
  emptyText: string;
  rows: MomentRowModel[];
  total: number;
  /** «Vis alle N» eller «Vis færre»; `null` når alle radene alt står der. */
  toggleLabel: string | null;
};

/** `YYYY-MM-DD` som en lokal dato, så dag og måned ikke flytter seg med tidssonen. */
export function localDate(playedOn: string): Date {
  const [year, month, day] = playedOn.split('-').map(Number);
  return new Date(year, month - 1, day);
}

/** Én rad i «Sjeldne slag», og den samme raden på Æreslista (#2894). */
export function momentRow(m: AeresbrettMoment): MomentRowModel {
  const shot = topplisteT(MOMENT_KIND_KEY[m.kind]);
  const date = localDate(m.playedOn);
  const course = m.courseName;
  const spoken = course
    ? topplisteT('momentSpoken', { kind: shot, name: m.name, hole: m.hole, course, date: formatLongDateNb(date) })
    : topplisteT('momentSpokenNoCourse', { kind: shot, name: m.name, hole: m.hole, date: formatLongDateNb(date) });
  return {
    mark: ACHIEVEMENT_MARKS[RARE_MOMENT_MARK_KEY[m.kind]],
    name: m.name,
    isViewer: m.isViewer,
    shot,
    where: course
      ? topplisteT('momentWhere', { hole: m.hole, course })
      : topplisteT('momentWhereNoCourse', { hole: m.hole }),
    date: formatShortDateNb(date),
    spoken: m.isViewer ? `${spoken}, ${topplisteT('youSpoken')}` : spoken,
  };
}

/**
 * «Sjeldne slag i 2026»-kortet, likt under alle tre fanene. `null` når ingen sesong er kjent
 * (da står bare «Ingen runder ennå»). Rekkefølgen og grensen på fem rader er
 * `buildAeresbrettView` sin og `MOMENTS_VISIBLE`; her står bare tilstandene og tekstene.
 */
export function buildMomentsModel(view: AeresbrettView, expanded: boolean): MomentsModel | null {
  if (view.seasonYear === null) return null;
  const year = view.seasonYear;
  const base = {
    title: topplisteT('momentsTitle', { year }),
    subtitle: topplisteT('momentsSubtitle'),
    emptyText: view.seasonOver ? topplisteT('momentsNoneOver', { year }) : topplisteT('momentsNone'),
  };
  if (view.moments === null) return { ...base, state: 'failed', rows: [], total: 0, toggleLabel: null };
  const total = view.moments.length;
  if (total === 0) return { ...base, state: 'empty', rows: [], total, toggleLabel: null };
  const shown = expanded ? view.moments : view.moments.slice(0, MOMENTS_VISIBLE);
  const toggleLabel =
    total <= MOMENTS_VISIBLE
      ? null
      : expanded
        ? topplisteT('momentsShowLess')
        : topplisteT('momentsShowAll', { count: total });
  return { ...base, state: 'list', rows: shown.map(momentRow), total, toggleLabel };
}
