// #2283 (part E): the cup's «Meldt inn fra kampene», as data. One fixture, two suites.
//
// The app's copy (`native/app/src/lib/cupManageCopy.ts`) is the approved text (drawing V3,
// 15.11); the web has it in the message catalog (`cup.sideAwards.reported*`, `cup.matchFallback`)
// so the English catalog can follow. A cup organiser who registers side awards on the web one
// day and in the app the next would read two wordings of one box. So both sides assert the SAME
// cases and the SAME Norwegian text:
//
//   web: `app/[locale]/admin/cup/[id]/cupSideReportsCopy.parity.test.tsx`
//   app: `native/app/src/lib/cupSideReportsCopy.parity.test.ts`
//
// Neither suite imports the other side: the web's CI job has no native dependencies installed,
// so a web test must never load a file under `native/`. A reworded sentence on either side turns
// that side's suite red; changing the wording on purpose means editing the text here and in both
// copies. The rules a box follows are in the cases too, so they cannot drift apart either:
// missing matches show only when some match has answered, none of the cup's matches having
// answered is one sentence, «over max» means the count is above the max, names go in
// parentheses and a team with none has no parentheses, a match without a label is «Match».
//
// Data only: inputs and the exact expected output, hard-coded. No logic, no React Native, no
// next-intl, and relative imports only (the app's jest and the web's vitest both load this file).
// The expected strings were taken from the approved drawing when this fixture was written.
import type { CupGirReport, CupSlotReports } from './cupSideReports';

/** The box's two fixed sentences, and the one an empty box shows. */
export const CUP_REPORTED_FIXED = {
  heading: 'Meldt inn fra kampene',
  readFailed: 'Fikk ikke hentet det kampene har meldt inn.',
  none: 'Ingen kamper har meldt inn ennå.',
} as const;

/** One answer line under a closest-to-pin or longest-drive award: the three texts it shows. */
export type CupSlotLineText = {
  sender: string;
  /** The winner's name, or «Ingen på green» / «Ingen på fairway». */
  name: string;
  /** «1,8 m»; null when the match gave no distance. */
  distance: string | null;
};

export type CupSlotBoxCase = {
  title: string;
  kind: 'ctp' | 'ld';
  reports: CupSlotReports | 'failed';
  /** Answer lines, in the order the reports give them. */
  lines: CupSlotLineText[];
  /** The matches that have not answered, one text each, after the answer lines. */
  missing: string[];
  /** The one sentence an empty box shows instead of lines; null when there are lines. */
  empty: string | null;
};

export type CupGirTeamLineText = {
  /** «Rød: 3 (Jonas, Marte, Sigrid) · maks 2 GIR». */
  text: string;
  /** Over the max: shown in the warning colour. */
  over: boolean;
};

export type CupGirBoxCase = {
  title: string;
  team1Name: string;
  team2Name: string;
  reports: CupGirReport | 'failed';
  /** One line per team, team 1 first. Empty when the box shows one sentence instead. */
  teams: CupGirTeamLineText[];
  /** The matches that have not reported on the hole, one text each, after the team lines. */
  missing: string[];
  /** The one sentence the box shows instead of the teams; null when it shows the teams. */
  empty: string | null;
};

/** Closest to pin and longest drive: what each match answered, and who has not. */
export const CUP_SLOT_BOX_CASES: CupSlotBoxCase[] = [
  {
    title: 'two answers with distance',
    kind: 'ctp',
    reports: {
      kind: 'ctp',
      holeNumber: 3,
      lines: [
        { gameId: 'g2', matchLabel: 'Four-ball 2', name: 'Kristian', distanceM: 1.8 },
        { gameId: 'g1', matchLabel: 'Four-ball 1', name: 'Marte', distanceM: 2.4 },
      ],
      missing: [],
    },
    lines: [
      { sender: 'Four-ball 2', name: 'Kristian', distance: '1,8 m' },
      { sender: 'Four-ball 1', name: 'Marte', distance: '2,4 m' },
    ],
    missing: [],
    empty: null,
  },
  {
    title: 'one answer, one match that has not answered',
    kind: 'ctp',
    reports: {
      kind: 'ctp',
      holeNumber: 3,
      lines: [{ gameId: 'g1', matchLabel: 'Four-ball 1', name: 'Marte', distanceM: 2.4 }],
      missing: [{ gameId: 'g2', matchLabel: 'Four-ball 2' }],
    },
    lines: [{ sender: 'Four-ball 1', name: 'Marte', distance: '2,4 m' }],
    missing: ['Four-ball 2 har ikke meldt inn'],
    empty: null,
  },
  {
    title: 'closest to pin: no one on the green, a whole-metre distance and an unnamed match',
    kind: 'ctp',
    reports: {
      kind: 'ctp',
      holeNumber: 7,
      lines: [
        { gameId: 'g1', matchLabel: 'Four-ball 1', name: 'Jonas', distanceM: 2 },
        { gameId: 'g2', matchLabel: 'Four-ball 2', name: null, distanceM: null },
        { gameId: 'g3', matchLabel: null, name: 'Kari', distanceM: 11.5 },
      ],
      missing: [{ gameId: 'g4', matchLabel: null }],
    },
    lines: [
      { sender: 'Four-ball 1', name: 'Jonas', distance: '2,0 m' },
      { sender: 'Four-ball 2', name: 'Ingen på green', distance: null },
      { sender: 'Match', name: 'Kari', distance: '11,5 m' },
    ],
    missing: ['Match har ikke meldt inn'],
    empty: null,
  },
  {
    title: 'longest drive: an answer without distance and no one on the fairway',
    kind: 'ld',
    reports: {
      kind: 'ld',
      holeNumber: 9,
      lines: [
        { gameId: 'g1', matchLabel: 'Four-ball 1', name: 'Jonas', distanceM: null },
        { gameId: 'g2', matchLabel: 'Four-ball 2', name: null, distanceM: null },
      ],
      missing: [],
    },
    lines: [
      { sender: 'Four-ball 1', name: 'Jonas', distance: null },
      { sender: 'Four-ball 2', name: 'Ingen på fairway', distance: null },
    ],
    missing: [],
    empty: null,
  },
  {
    title: 'no match has reported: one sentence, and the matches are not named',
    kind: 'ctp',
    reports: {
      kind: 'ctp',
      holeNumber: 3,
      lines: [],
      missing: [
        { gameId: 'g1', matchLabel: 'Four-ball 1' },
        { gameId: 'g2', matchLabel: 'Four-ball 2' },
      ],
    },
    lines: [],
    missing: [],
    empty: 'Ingen kamper har meldt inn ennå.',
  },
  {
    title: 'the read failed',
    kind: 'ld',
    reports: 'failed',
    lines: [],
    missing: [],
    empty: 'Fikk ikke hentet det kampene har meldt inn.',
  },
];

/** GIR: one box under both counters, a line per team. */
export const CUP_GIR_BOX_CASES: CupGirBoxCase[] = [
  {
    title: 'under the max, a team with none, and a match that has not reported',
    team1Name: 'Rød',
    team2Name: 'Blå',
    reports: {
      holeNumber: 5,
      maxPerTeam: 2,
      team1: { count: 1, names: ['Jonas'] },
      team2: { count: 0, names: [] },
      reportedMatches: 1,
      missing: [{ gameId: 'g2', matchLabel: 'Four-ball 2' }],
    },
    teams: [
      { text: 'Rød: 1 (Jonas)', over: false },
      { text: 'Blå: 0', over: false },
    ],
    missing: ['Four-ball 2 har ikke meldt inn'],
    empty: null,
  },
  {
    title: 'over the max: the count stands, with the max beside it, for that team only',
    team1Name: 'Rød',
    team2Name: 'Blå',
    reports: {
      holeNumber: 5,
      maxPerTeam: 2,
      team1: { count: 3, names: ['Jonas', 'Marte', 'Sigrid'] },
      team2: { count: 1, names: ['Tore'] },
      reportedMatches: 2,
      missing: [],
    },
    teams: [
      { text: 'Rød: 3 (Jonas, Marte, Sigrid) · maks 2 GIR', over: true },
      { text: 'Blå: 1 (Tore)', over: false },
    ],
    missing: [],
    empty: null,
  },
  {
    title: 'exactly the max is not over it',
    team1Name: 'Rød',
    team2Name: 'Blå',
    reports: {
      holeNumber: 5,
      maxPerTeam: 2,
      team1: { count: 2, names: ['Jonas', 'Marte'] },
      team2: { count: 2, names: ['Tore', 'Kari'] },
      reportedMatches: 2,
      missing: [],
    },
    teams: [
      { text: 'Rød: 2 (Jonas, Marte)', over: false },
      { text: 'Blå: 2 (Tore, Kari)', over: false },
    ],
    missing: [],
    empty: null,
  },
  {
    title: 'the cup’s own team names, a shared foursomes ball and an unnamed match that has not reported',
    team1Name: 'Nord',
    team2Name: 'Sør',
    reports: {
      holeNumber: 12,
      maxPerTeam: 3,
      team1: { count: 1, names: ['Ole/Kari'] },
      team2: { count: 4, names: ['Tore', 'Siri', 'Per', 'Eva'] },
      reportedMatches: 1,
      missing: [{ gameId: 'g3', matchLabel: null }],
    },
    teams: [
      { text: 'Nord: 1 (Ole/Kari)', over: false },
      { text: 'Sør: 4 (Tore, Siri, Per, Eva) · maks 3 GIR', over: true },
    ],
    missing: ['Match har ikke meldt inn'],
    empty: null,
  },
  {
    title: 'no match has reported: one sentence, and the matches are not named',
    team1Name: 'Rød',
    team2Name: 'Blå',
    reports: {
      holeNumber: 5,
      maxPerTeam: 2,
      team1: { count: 0, names: [] },
      team2: { count: 0, names: [] },
      reportedMatches: 0,
      missing: [
        { gameId: 'g1', matchLabel: 'Four-ball 1' },
        { gameId: 'g2', matchLabel: 'Four-ball 2' },
      ],
    },
    teams: [],
    missing: [],
    empty: 'Ingen kamper har meldt inn ennå.',
  },
  {
    title: 'the read failed',
    team1Name: 'Rød',
    team2Name: 'Blå',
    reports: 'failed',
    teams: [],
    missing: [],
    empty: 'Fikk ikke hentet det kampene har meldt inn.',
  },
];
