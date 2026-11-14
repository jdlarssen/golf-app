// #2259 PR 2: det Topplista viser, regnet ut av svaret fra `/api/aeresbrett`.
//
// Plassene, delt plass og «til topp 5» er serverens (`lib/stats/aeresbrett.ts`).
// Her står bare det skjermen gjør med dem: lederkortet (bare når én har plass 1,
// på alle tre fanene), «Du er på …»-linja, strekene mot lederen, medaljene på
// plass 1–3 og tekstene i hver tilstand. Ren, så skjermen bare tegner.
import type {
  AeresbrettMe,
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

  const top = board.rows[0]?.count ?? 1;
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
