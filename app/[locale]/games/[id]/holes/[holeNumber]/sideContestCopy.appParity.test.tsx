import { renderHook, render } from '@testing-library/react';
import { useTranslations } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';
import { SideWinnersForm } from '@/app/[locale]/admin/games/[id]/avslutt/SideWinnersForm';
import type { SideSlotView } from '@/lib/games/finishSideSlots';
import type { SideClaimFailure } from '@/lib/games/sideClaims';
import type { HoleContest, HoleContestCategory } from '@/lib/games/sideContest';

// The app's copy modules reach `webLink.ts`, which imports react-native: Flow source that
// vitest cannot parse, for one failure sentence we do not compare. Only that module is
// stubbed; everything else the copy modules import is plain text and plain functions.
vi.mock('@/native/app/src/lib/webLink', () => ({ WEB_LINK_TEXT: { missingBaseUrl: '' } }));

import { useSideContestText, type SavedBy } from './sideContestText';

// The app's modules are loaded at run time on purpose, not with `import`: a static import
// makes the root `tsc` follow them into react-native's typings, whose global `FormData`
// replaces the DOM's and breaks `FormData.get` in unrelated web files. The shapes below are
// what this test calls; a renamed or removed function is a run-time failure here.
const NATIVE_LIB = '@/native/app/src/lib/';
async function loadNative<T>(module: string): Promise<T> {
  return (await import(/* @vite-ignore */ `${NATIVE_LIB}${module}`)) as T;
}

type AppSlot = { key: string; category: 'longest_drive' | 'closest_to_pin'; position: number; hole: number | null };
type AppSideContestCopy = {
  SIDE_CONTEST_TEXT: Record<string, string>;
  contestTitle(category: HoleContestCategory): string;
  noneLabel(category: HoleContestCategory): string;
  contestPointsLine(contest: HoleContest): string;
  sheetKicker(contest: HoleContest, holeNumber: number): string;
  sideQuestion(contest: HoleContest & { category: 'closest_to_pin' | 'longest_drive' }): string;
  girQuestion(par: number): string;
  sideStatus(contest: HoleContest, savedBy: SavedBy | null, offline: boolean): string;
  girStatus(max: number, oneBallPerSide: boolean, savedBy: SavedBy | null, offline: boolean): string;
  sideAnswer(category: 'closest_to_pin' | 'longest_drive', name: string | null, distanceM: number | null): string;
  girAnswer(hits: number, balls: number, allMissed: boolean): string;
  formatDistance(distanceM: number): string;
  describeSideClaimFailure(failure: SideClaimFailure, contest: HoleContest): string;
};
type AppEndGameCopy = {
  REPORTED_TEXT: { heading: string; readFailed: string };
  reportedFlight(flightNumber: number): string;
  reportedMissing(flightNumber: number): string;
  reportedNone(hole: number): string;
  reportedName(category: 'closest_to_pin' | 'longest_drive', name: string | null): string;
  reportedDistance(distanceM: number): string;
  slotRowTitle(slot: AppSlot): string;
};
type AppDisplay = { formatNameList(names: readonly string[]): string };

const appCopy = await loadNative<AppSideContestCopy>('sideContestCopy');
const appEnd = await loadNative<AppEndGameCopy>('endGameCopy');
const { formatNameList } = await loadNative<AppDisplay>('display');
const { SIDE_CONTEST_TEXT } = appCopy;
const { REPORTED_TEXT, reportedDistance, reportedFlight, reportedMissing, reportedName, reportedNone, slotRowTitle } =
  appEnd;

// #2283 (part D) — Type B: the web's side-contest wording is the app's, character
// for character. The app's copy (`native/app/src/lib/sideContestCopy.ts`,
// `endGameCopy.ts`) is the approved text; the web has it in the message catalog
// (`holes.sideContest.*`, `holes.girContest.*`, `admin.game.sideWinners.reported*`)
// so the English catalog can follow. Two copies of one sentence drift, and a
// player in a flight with one phone on each would read two wordings of one thing.
// Every string and every formatted output is called on both sides and compared;
// a reworded message on either side turns this red.
//
// Norwegian only: the app has no other language. The English catalog is held to
// the same keys and ICU shape by `sideContestText.test.ts`.

/** Calls both sides for every case and keeps the ones that differ, so one run lists all of them. */
function createComparison() {
  const mismatches: { label: string; web: string; app: string }[] = [];
  let compared = 0;
  return {
    same(label: string, web: string, app: string) {
      compared += 1;
      if (web !== app) mismatches.push({ label, web, app });
    },
    mismatches,
    get compared() {
      return compared;
    },
  };
}

const CATEGORIES: HoleContestCategory[] = ['closest_to_pin', 'longest_drive', 'gir'];

/** Every shape a hole's contest has: the game's own slot, and the cup's points (whole and half). */
const CONTESTS: HoleContest[] = [
  { category: 'closest_to_pin', source: 'game' },
  { category: 'longest_drive', source: 'game' },
  { category: 'closest_to_pin', source: 'cup', points: 2 },
  { category: 'longest_drive', source: 'cup', points: 1 },
  { category: 'closest_to_pin', source: 'cup', points: 0.5 },
  { category: 'gir', source: 'cup', points: 1.5, maxPerTeam: 2 },
  { category: 'gir', source: 'cup', points: 1, maxPerTeam: 3 },
];

const SAVED_BY: (SavedBy | null)[] = [null, { me: true }, { me: false, name: 'Marte' }, { me: false, name: null }];

/** One entry per code, as a record, so a new code in the lib fails `tsc` here until it is compared. */
const FAILURES: Record<SideClaimFailure, true> = {
  not_authenticated: true,
  not_active: true,
  not_player: true,
  wrong_flight: true,
  no_slot: true,
  bad_distance: true,
  db_error: true,
};

/** Every distance the database holds: `numeric(3,1)` between 0,1 and 99,9. */
const DISTANCES = Array.from({ length: 999 }, (_, i) => (i + 1) / 10);

describe('the hole page’s side-contest wording is the app’s', () => {
  const text = renderHook(() => useSideContestText()).result.current;
  const t = renderHook(() => useTranslations('holes.sideContest')).result.current;
  const g = renderHook(() => useTranslations('holes.girContest')).result.current;

  it('the fixed strings', () => {
    const cmp = createComparison();
    // The web's counterpart of every key in the app's table. A new key there has no entry
    // here and fails the loop below until someone decides where the web has it.
    const web: Record<string, string> = {
      report: text.report,
      gameKicker: t('rowGame'),
      cupKicker: t('kickerCup', { hole: 1, points: 'x' }).split(' · ')[0],
      rowOffline: text.rowOffline,
      rowFetchFailed: text.rowFetchFailed,
      sheetOffline: text.sheetOffline,
      distanceLabel: t('distanceLabel'),
      metre: t('metre'),
      metreField: t('metreField'),
      shorter: t('shorter'),
      longer: t('longer'),
      done: t('done'),
      close: t('close'),
      you: text.you,
      oneBall: g('oneBall'),
    };
    for (const [key, app] of Object.entries(SIDE_CONTEST_TEXT)) {
      cmp.same(key, web[key] ?? `(the web has no counterpart for «${key}»)`, app);
    }
    expect(cmp.mismatches).toEqual([]);
    expect(cmp.compared).toBe(Object.keys(SIDE_CONTEST_TEXT).length);
  });

  it('titles and the «none» answers, per category', () => {
    const cmp = createComparison();
    for (const category of CATEGORIES) {
      cmp.same(`title ${category}`, text.title(category), appCopy.contestTitle(category));
      cmp.same(`none ${category}`, text.noneLabel(category), appCopy.noneLabel(category));
    }
    expect(cmp.mismatches).toEqual([]);
  });

  it('the row’s subtitle, the sheet’s kicker and the question, for every shape of contest', () => {
    const cmp = createComparison();
    for (const contest of CONTESTS) {
      const label = `${contest.source} ${contest.category}`;
      cmp.same(`pointsLine ${label}`, text.pointsLine(contest), appCopy.contestPointsLine(contest));
      for (const hole of [1, 7, 18]) {
        cmp.same(`kicker ${label} hole ${hole}`, text.kicker(contest, hole), appCopy.sheetKicker(contest, hole));
      }
      if (contest.category !== 'gir') {
        cmp.same(`question ${label}`, text.sideQuestion({ ...contest, category: contest.category }), appCopy.sideQuestion({ ...contest, category: contest.category }));
      }
    }
    expect(cmp.mismatches).toEqual([]);
  });

  it('the GIR question follows par', () => {
    const cmp = createComparison();
    for (const par of [2, 3, 4, 5, 6, 7]) cmp.same(`par ${par}`, text.girQuestion(par), appCopy.girQuestion(par));
    expect(cmp.mismatches).toEqual([]);
  });

  it('the status line, for who saved and online or not', () => {
    const cmp = createComparison();
    for (const contest of CONTESTS.filter((c) => c.category !== 'gir')) {
      for (const savedBy of SAVED_BY) {
        for (const offline of [false, true]) {
          cmp.same(
            `sideStatus ${contest.source} ${contest.category} ${JSON.stringify(savedBy)} offline=${offline}`,
            text.sideStatus(contest, savedBy, offline),
            appCopy.sideStatus(contest, savedBy, offline),
          );
        }
      }
    }
    for (const max of [1, 2, 3]) {
      for (const oneBall of [false, true]) {
        for (const savedBy of SAVED_BY) {
          for (const offline of [false, true]) {
            cmp.same(
              `girStatus max=${max} oneBall=${oneBall} ${JSON.stringify(savedBy)} offline=${offline}`,
              text.girStatus(max, oneBall, savedBy, offline),
              appCopy.girStatus(max, oneBall, savedBy, offline),
            );
          }
        }
      }
    }
    expect(cmp.mismatches).toEqual([]);
  });

  it('the answers in the row', () => {
    const cmp = createComparison();
    for (const category of ['closest_to_pin', 'longest_drive'] as const) {
      for (const name of [null, 'Marte', 'Deg']) {
        for (const distance of [null, 0.1, 2, 2.5, 11.5, 99.9]) {
          cmp.same(
            `sideAnswer ${category} ${name} ${distance}`,
            text.sideAnswer(category, name, distance),
            appCopy.sideAnswer(category, name, distance),
          );
        }
      }
    }
    for (const [hits, balls, allMissed] of [
      [0, 4, true],
      [1, 4, false],
      [2, 4, false],
      [4, 4, false],
      [1, 2, false],
    ] as const) {
      cmp.same(`girAnswer ${hits}/${balls} ${allMissed}`, text.girAnswer(hits, balls, allMissed), appCopy.girAnswer(hits, balls, allMissed));
    }
    expect(cmp.mismatches).toEqual([]);
  });

  it('the distance, on every step the database holds', () => {
    const cmp = createComparison();
    for (const distance of DISTANCES) cmp.same(`distance ${distance}`, text.formatDistance(distance), appCopy.formatDistance(distance));
    expect(cmp.mismatches).toEqual([]);
    expect(cmp.compared).toBe(999);
  });

  it('«Deg og Marte», the names of a foursomes side', () => {
    const cmp = createComparison();
    for (const names of [[], ['Deg'], ['Deg', 'Marte'], ['Deg', 'Marte', 'Tore'], ['Ola', 'Marte', 'Tore', 'Kari']]) {
      cmp.same(`nameList ${JSON.stringify(names)}`, text.nameList(names), formatNameList(names));
    }
    expect(cmp.mismatches).toEqual([]);
  });

  it('what the player is told when a report was not saved, for every code and both groups', () => {
    const cmp = createComparison();
    const inFlight: HoleContest = { category: 'closest_to_pin', source: 'game' };
    const inMatch: HoleContest = { category: 'closest_to_pin', source: 'cup', points: 2 };
    for (const failure of Object.keys(FAILURES) as SideClaimFailure[]) {
      for (const contest of [inFlight, inMatch]) {
        cmp.same(`${failure} ${contest.source}`, text.describeFailure(failure, contest), appCopy.describeSideClaimFailure(failure, contest));
      }
    }
    expect(cmp.mismatches).toEqual([]);
    expect(cmp.compared).toBe(Object.keys(FAILURES).length * 2);
  });
});

describe('the finish page’s «Meldt inn fra flightene» is the app’s', () => {
  /** What the box shows, as strings: the heading, then per line its spans (or its text), or the single sentence of an empty box. */
  function readBox(container: HTMLElement, testId: string) {
    const box = container.querySelector(`[data-testid="${testId}"]`) as HTMLElement;
    expect(box, testId).not.toBeNull();
    return {
      heading: box.firstElementChild?.textContent ?? '',
      ariaLabel: box.getAttribute('aria-label') ?? '',
      empty: box.querySelector('p')?.textContent ?? null,
      lines: [...box.querySelectorAll('li')].map((li) => {
        const spans = [...li.querySelectorAll('span')].map((s) => s.textContent ?? '');
        return spans.length > 0 ? spans : [li.textContent ?? ''];
      }),
    };
  }

  const players = [{ user_id: 'jonas', display_name: 'Jonas Berg' }];
  const ldSlot = (position: number, hole: number | null) => ({
    key: `ld-${position}`,
    category: 'longest_drive' as const,
    position,
    hole,
  });
  const ctpSlot = (position: number, hole: number | null) => ({
    key: `ctp-${position}`,
    category: 'closest_to_pin' as const,
    position,
    hole,
  });

  it('the lines: flight, name or «Ingen på …», distance, and the flights that have not reported', () => {
    const ld: SideSlotView = {
      hole: 9,
      reports: {
        hole: 9,
        lines: [
          { flightNumber: 1, name: 'Jonas', distanceM: null },
          { flightNumber: 2, name: null, distanceM: null },
          { flightNumber: 3, name: 'Kristian', distanceM: 0.1 },
          { flightNumber: 4, name: 'Marte', distanceM: 1.8 },
          { flightNumber: 5, name: 'Tore', distanceM: 2 },
          { flightNumber: 6, name: 'Kari', distanceM: 11.5 },
          { flightNumber: 7, name: 'Ola', distanceM: 99.9 },
          // A game with one flight reports under 0.
          { flightNumber: 0, name: 'Siri', distanceM: 2.4 },
        ],
        missingFlights: [8, 0],
      },
    };
    const ctp: SideSlotView = {
      hole: 7,
      reports: { hole: 7, lines: [{ flightNumber: 2, name: null, distanceM: null }], missingFlights: [1] },
    };
    const { container } = render(
      <SideWinnersForm gameId="G1" ldCount={1} ctpCount={1} players={players} action={() => {}} ldSlots={[ld]} ctpSlots={[ctp]} />,
    );
    const cmp = createComparison();

    const ldBox = readBox(container, 'side-reports-ld-1');
    const reported = (ld.reports as { lines: { flightNumber: number; name: string | null; distanceM: number | null }[] }).lines;
    reported.forEach((line, index) => {
      const spans = ldBox.lines[index];
      cmp.same(`ld flight ${line.flightNumber}`, spans[0], reportedFlight(line.flightNumber));
      cmp.same(`ld name flight ${line.flightNumber}`, spans[1], reportedName('longest_drive', line.name));
      if (line.distanceM !== null) cmp.same(`ld distance ${line.distanceM}`, spans[2], reportedDistance(line.distanceM));
      else cmp.same(`ld no distance flight ${line.flightNumber}`, String(spans.length), '2');
    });
    cmp.same('ld missing 8', ldBox.lines[reported.length][0], reportedMissing(8));
    cmp.same('ld missing 0', ldBox.lines[reported.length + 1][0], reportedMissing(0));
    cmp.same('ld heading', ldBox.heading, REPORTED_TEXT.heading);
    cmp.same('ld aria-label', ldBox.ariaLabel, REPORTED_TEXT.heading);

    const ctpBox = readBox(container, 'side-reports-ctp-1');
    cmp.same('ctp «Ingen på green»', ctpBox.lines[0][1], reportedName('closest_to_pin', null));
    cmp.same('ctp missing 1', ctpBox.lines[1][0], reportedMissing(1));

    expect(cmp.mismatches).toEqual([]);
    expect(ldBox.lines).toHaveLength(reported.length + 2);
  });

  it('the empty box and the failed read', () => {
    const none: SideSlotView = { hole: 7, reports: { hole: 7, lines: [], missingFlights: [1, 2] } };
    const failed: SideSlotView = { hole: 9, reports: 'failed' };
    const { container } = render(
      <SideWinnersForm gameId="G1" ldCount={1} ctpCount={1} players={players} action={() => {}} ldSlots={[failed]} ctpSlots={[none]} />,
    );
    const cmp = createComparison();
    cmp.same('none on hole 7', readBox(container, 'side-reports-ctp-1').empty ?? '', reportedNone(7));
    cmp.same('read failed', readBox(container, 'side-reports-ld-1').empty ?? '', REPORTED_TEXT.readFailed);
    expect(cmp.mismatches).toEqual([]);
    expect(cmp.compared).toBe(2);
  });

  it('the slot’s label with and without a hole', () => {
    const hole = (n: number): SideSlotView => ({ hole: n, reports: { hole: n, lines: [], missingFlights: [] } });
    const noHole: SideSlotView = { hole: null, reports: null };
    const { container } = render(
      <SideWinnersForm
        gameId="G1"
        ldCount={2}
        ctpCount={2}
        players={players}
        action={() => {}}
        ldSlots={[hole(9), noHole]}
        ctpSlots={[hole(7), noHole]}
      />,
    );
    const labels = [...container.querySelectorAll('label > span')].map((s) => s.textContent ?? '');
    const cmp = createComparison();
    const expected = [ldSlot(1, 9), ldSlot(2, null), ctpSlot(1, 7), ctpSlot(2, null)].map(slotRowTitle);
    expected.forEach((title, index) => cmp.same(`label ${index}`, labels[index] ?? '', title));
    expect(cmp.mismatches).toEqual([]);
    expect(cmp.compared).toBe(4);
  });
});
