// #2283 (part D): the side contest's words, as data. One fixture, two suites.
//
// The app's copy (`native/app/src/lib/sideContestCopy.ts`, `endGameCopy.ts`) is the approved
// text (the drawings, 15.11); the web has it in the message catalog (`holes.sideContest.*`,
// `holes.girContest.*`, `admin.game.sideWinners.reported*`) so the English catalog can follow.
// Two copies of one sentence drift, and a player in a flight with one phone on each would read
// two wordings of one thing. So both sides assert the SAME cases and the SAME Norwegian text:
//
//   web: `app/[locale]/games/[id]/holes/[holeNumber]/sideContestCopy.parity.test.tsx`
//   app: `native/app/src/lib/sideContestCopy.parity.test.ts`
//
// Neither suite imports the other side, the way `lib/league/leagueFormatLine.test.ts` and
// `native/app/src/lib/leagueCopy.test.ts` do it: the web's CI job has no native dependencies
// installed, so a web test must never load a file under `native/`. A reworded sentence on either
// side turns that side's suite red; changing the wording on purpose means editing the text here
// and in both copies.
//
// Data only: inputs and the exact expected output, hard-coded. No logic, no React Native, no
// next-intl, and relative imports only (the app's jest and the web's vitest both load this file).
// The expected strings were taken from the app's copy when this fixture was written.
import type { SideClaimFailure } from './sideClaims';
import type { HoleContest, HoleContestCategory, SideContestCategory } from './sideContest';

/** Who saved last. Structurally the web's and the app's `SavedBy`. */
export type SavedByCase = { me: true } | { me: false; name: string | null };
/** A contest that has a question over the list: not GIR, which asks per par. */
export type SideContestOnly = Extract<HoleContest, { category: SideContestCategory }>;

export type TitleCase = { category: HoleContestCategory; title: string; none: string };
export type PointsLineCase = { contest: HoleContest; text: string };
export type KickerCase = { contest: HoleContest; hole: number; text: string };
export type QuestionCase = { contest: SideContestOnly; text: string };
export type GirQuestionCase = { par: number; text: string };
export type SideStatusCase = { contest: HoleContest; savedBy: SavedByCase | null; offline: boolean; text: string };
export type GirStatusCase = {
  maxPerTeam: number;
  oneBallPerSide: boolean;
  savedBy: SavedByCase | null;
  offline: boolean;
  text: string;
};
export type SideAnswerCase = {
  category: SideContestCategory;
  name: string | null;
  distanceM: number | null;
  text: string;
};
export type GirAnswerCase = { hits: number; balls: number; allMissed: boolean; text: string };
export type DistanceCase = { distanceM: number; text: string };
export type NameListCase = { names: string[]; text: string };
export type FailureCase = { failure: SideClaimFailure; contest: HoleContest; text: string };
/** One line of the finish page's «Meldt inn fra flightene»: what a flight reported, and the three texts it shows. */
export type ReportedLineCase = {
  flightNumber: number;
  name: string | null;
  distanceM: number | null;
  flight: string;
  nameText: string;
  distanceText: string | null;
};
export type ReportedBoxCase = {
  category: SideContestCategory;
  hole: number;
  lines: ReportedLineCase[];
  missing: { flightNumber: number; text: string }[];
};
export type ReportedNoneCase = { hole: number; text: string };
export type SlotLabelCase = { category: SideContestCategory; position: number; hole: number | null; text: string };

// Every shape a hole's contest has: the game's own slot, and the cup's points (whole and half).
const GAME_CTP = { category: 'closest_to_pin', source: 'game' } as const satisfies HoleContest;
const GAME_LD = { category: 'longest_drive', source: 'game' } as const satisfies HoleContest;
const CUP_CTP = { category: 'closest_to_pin', source: 'cup', points: 2 } as const satisfies HoleContest;
const CUP_LD = { category: 'longest_drive', source: 'cup', points: 1 } as const satisfies HoleContest;
const CUP_CTP_HALF = { category: 'closest_to_pin', source: 'cup', points: 0.5 } as const satisfies HoleContest;
const CUP_GIR_2 = { category: 'gir', source: 'cup', points: 1.5, maxPerTeam: 2 } as const satisfies HoleContest;
const CUP_GIR_3 = { category: 'gir', source: 'cup', points: 1, maxPerTeam: 3 } as const satisfies HoleContest;

const SAVED_BY_ME = { me: true } as const satisfies SavedByCase;
const SAVED_BY_MARTE = { me: false, name: 'Marte' } as const satisfies SavedByCase;
const SAVED_BY_UNNAMED = { me: false, name: null } as const satisfies SavedByCase;

/** The app's `SIDE_CONTEST_TEXT`, key for key; the web maps each key to its message. */
export const FIXED_STRINGS = {
  report: 'Meld inn',
  gameKicker: 'Sidekonkurranse',
  cupKicker: 'Sidepoeng',
  rowOffline: 'Uten nett. Meld inn senere.',
  rowFetchFailed: 'Fikk ikke hentet. Prøver igjen.',
  sheetOffline: 'Du er uten nett. Kom tilbake til dette hullet og meld inn når du har dekning.',
  distanceLabel: 'Hvor nær?',
  metre: 'm',
  metreField: 'Meter',
  shorter: '0,5 meter kortere',
  longer: '0,5 meter lengre',
  done: 'Ferdig',
  close: 'Lukk',
  you: 'Deg',
  oneBall: 'Laget spiller én ball, så det teller én gang.',
} as const;

/** The finish box's two fixed sentences (`REPORTED_TEXT` in the app). */
export const REPORTED_FIXED = {
  heading: 'Meldt inn fra flightene',
  readFailed: 'Fikk ikke hentet det flightene har meldt inn.',
} as const;

/** The title and the «none» answer per category. */
export const TITLE_CASES: TitleCase[] = [
  { category: 'closest_to_pin', title: 'Nærmest pinnen', none: 'Ingen på green' },
  { category: 'longest_drive', title: 'Lengste drive', none: 'Ingen på fairway' },
  { category: 'gir', title: 'GIR', none: 'Ingen traff greenen' },
];

/** The row's subtitle before anything is reported. */
export const POINTS_LINE_CASES: PointsLineCase[] = [
  { contest: GAME_CTP, text: 'Sidekonkurranse' },
  { contest: GAME_LD, text: 'Sidekonkurranse' },
  { contest: CUP_CTP, text: '+2 p til laget' },
  { contest: CUP_LD, text: '+1 p til laget' },
  { contest: CUP_CTP_HALF, text: '+0,5 p til laget' },
  { contest: CUP_GIR_2, text: '+1,5 p per GIR' },
  { contest: CUP_GIR_3, text: '+1 p per GIR' },
];

/** The sheet's kicker, on a one- and a two-digit hole. */
export const KICKER_CASES: KickerCase[] = [
  { contest: GAME_CTP, hole: 1, text: 'Sidekonkurranse · hull 1' },
  { contest: GAME_CTP, hole: 7, text: 'Sidekonkurranse · hull 7' },
  { contest: GAME_CTP, hole: 18, text: 'Sidekonkurranse · hull 18' },
  { contest: GAME_LD, hole: 1, text: 'Sidekonkurranse · hull 1' },
  { contest: GAME_LD, hole: 7, text: 'Sidekonkurranse · hull 7' },
  { contest: GAME_LD, hole: 18, text: 'Sidekonkurranse · hull 18' },
  { contest: CUP_CTP, hole: 1, text: 'Sidepoeng · hull 1 · +2 p til laget' },
  { contest: CUP_CTP, hole: 7, text: 'Sidepoeng · hull 7 · +2 p til laget' },
  { contest: CUP_CTP, hole: 18, text: 'Sidepoeng · hull 18 · +2 p til laget' },
  { contest: CUP_LD, hole: 1, text: 'Sidepoeng · hull 1 · +1 p til laget' },
  { contest: CUP_LD, hole: 7, text: 'Sidepoeng · hull 7 · +1 p til laget' },
  { contest: CUP_LD, hole: 18, text: 'Sidepoeng · hull 18 · +1 p til laget' },
  { contest: CUP_CTP_HALF, hole: 1, text: 'Sidepoeng · hull 1 · +0,5 p til laget' },
  { contest: CUP_CTP_HALF, hole: 7, text: 'Sidepoeng · hull 7 · +0,5 p til laget' },
  { contest: CUP_CTP_HALF, hole: 18, text: 'Sidepoeng · hull 18 · +0,5 p til laget' },
  { contest: CUP_GIR_2, hole: 1, text: 'Sidepoeng · hull 1 · +1,5 p per GIR' },
  { contest: CUP_GIR_2, hole: 7, text: 'Sidepoeng · hull 7 · +1,5 p per GIR' },
  { contest: CUP_GIR_2, hole: 18, text: 'Sidepoeng · hull 18 · +1,5 p per GIR' },
  { contest: CUP_GIR_3, hole: 1, text: 'Sidepoeng · hull 1 · +1 p per GIR' },
  { contest: CUP_GIR_3, hole: 7, text: 'Sidepoeng · hull 7 · +1 p per GIR' },
  { contest: CUP_GIR_3, hole: 18, text: 'Sidepoeng · hull 18 · +1 p per GIR' },
];

/** The question over the list; «flighten» in a game, «kampen» in a cup. */
export const QUESTION_CASES: QuestionCase[] = [
  { contest: GAME_CTP, text: 'Hvem i flighten lå nærmest på green etter utslaget?' },
  { contest: GAME_LD, text: 'Hvem i flighten slo lengst ut på fairway?' },
  { contest: CUP_CTP, text: 'Hvem i kampen lå nærmest på green etter utslaget?' },
  { contest: CUP_LD, text: 'Hvem i kampen slo lengst ut på fairway?' },
  { contest: CUP_CTP_HALF, text: 'Hvem i kampen lå nærmest på green etter utslaget?' },
];

/** The GIR question follows par (3-6 in the database; outside is clamped). */
export const GIR_QUESTION_CASES: GirQuestionCase[] = [
  { par: 2, text: 'Hvem var på greenen etter utslaget? Trykk på alle som traff.' },
  { par: 3, text: 'Hvem var på greenen etter utslaget? Trykk på alle som traff.' },
  { par: 4, text: 'Hvem var på greenen på to slag? Trykk på alle som traff.' },
  { par: 5, text: 'Hvem var på greenen på tre slag? Trykk på alle som traff.' },
  { par: 6, text: 'Hvem var på greenen på fire slag? Trykk på alle som traff.' },
  { par: 7, text: 'Hvem var på greenen på fire slag? Trykk på alle som traff.' },
];

/** The line above «Ferdig», for who saved and online or not. */
export const SIDE_STATUS_CASES: SideStatusCase[] = [
  { contest: GAME_CTP, savedBy: null, offline: false, text: 'Svaret deles med hele flighten. Arrangøren kårer vinneren til slutt.' },
  { contest: GAME_CTP, savedBy: null, offline: true, text: 'Svaret deles med hele flighten. Arrangøren kårer vinneren til slutt.' },
  { contest: GAME_CTP, savedBy: SAVED_BY_ME, offline: false, text: 'Lagret av deg. Alle i flighten kan endre.' },
  { contest: GAME_CTP, savedBy: SAVED_BY_ME, offline: true, text: 'Lagret av deg.' },
  { contest: GAME_CTP, savedBy: SAVED_BY_MARTE, offline: false, text: 'Lagret av Marte. Alle i flighten kan endre.' },
  { contest: GAME_CTP, savedBy: SAVED_BY_MARTE, offline: true, text: 'Lagret av Marte.' },
  { contest: GAME_CTP, savedBy: SAVED_BY_UNNAMED, offline: false, text: 'Lagret. Alle i flighten kan endre.' },
  { contest: GAME_CTP, savedBy: SAVED_BY_UNNAMED, offline: true, text: 'Lagret.' },
  { contest: GAME_LD, savedBy: null, offline: false, text: 'Svaret deles med hele flighten. Arrangøren kårer vinneren til slutt.' },
  { contest: GAME_LD, savedBy: null, offline: true, text: 'Svaret deles med hele flighten. Arrangøren kårer vinneren til slutt.' },
  { contest: GAME_LD, savedBy: SAVED_BY_ME, offline: false, text: 'Lagret av deg. Alle i flighten kan endre.' },
  { contest: GAME_LD, savedBy: SAVED_BY_ME, offline: true, text: 'Lagret av deg.' },
  { contest: GAME_LD, savedBy: SAVED_BY_MARTE, offline: false, text: 'Lagret av Marte. Alle i flighten kan endre.' },
  { contest: GAME_LD, savedBy: SAVED_BY_MARTE, offline: true, text: 'Lagret av Marte.' },
  { contest: GAME_LD, savedBy: SAVED_BY_UNNAMED, offline: false, text: 'Lagret. Alle i flighten kan endre.' },
  { contest: GAME_LD, savedBy: SAVED_BY_UNNAMED, offline: true, text: 'Lagret.' },
  { contest: CUP_CTP, savedBy: null, offline: false, text: 'Svaret deles med kampen. Arrangøren kårer vinneren til slutt.' },
  { contest: CUP_CTP, savedBy: null, offline: true, text: 'Svaret deles med kampen. Arrangøren kårer vinneren til slutt.' },
  { contest: CUP_CTP, savedBy: SAVED_BY_ME, offline: false, text: 'Lagret av deg. Alle i kampen kan endre.' },
  { contest: CUP_CTP, savedBy: SAVED_BY_ME, offline: true, text: 'Lagret av deg.' },
  { contest: CUP_CTP, savedBy: SAVED_BY_MARTE, offline: false, text: 'Lagret av Marte. Alle i kampen kan endre.' },
  { contest: CUP_CTP, savedBy: SAVED_BY_MARTE, offline: true, text: 'Lagret av Marte.' },
  { contest: CUP_CTP, savedBy: SAVED_BY_UNNAMED, offline: false, text: 'Lagret. Alle i kampen kan endre.' },
  { contest: CUP_CTP, savedBy: SAVED_BY_UNNAMED, offline: true, text: 'Lagret.' },
  { contest: CUP_LD, savedBy: null, offline: false, text: 'Svaret deles med kampen. Arrangøren kårer vinneren til slutt.' },
  { contest: CUP_LD, savedBy: null, offline: true, text: 'Svaret deles med kampen. Arrangøren kårer vinneren til slutt.' },
  { contest: CUP_LD, savedBy: SAVED_BY_ME, offline: false, text: 'Lagret av deg. Alle i kampen kan endre.' },
  { contest: CUP_LD, savedBy: SAVED_BY_ME, offline: true, text: 'Lagret av deg.' },
  { contest: CUP_LD, savedBy: SAVED_BY_MARTE, offline: false, text: 'Lagret av Marte. Alle i kampen kan endre.' },
  { contest: CUP_LD, savedBy: SAVED_BY_MARTE, offline: true, text: 'Lagret av Marte.' },
  { contest: CUP_LD, savedBy: SAVED_BY_UNNAMED, offline: false, text: 'Lagret. Alle i kampen kan endre.' },
  { contest: CUP_LD, savedBy: SAVED_BY_UNNAMED, offline: true, text: 'Lagret.' },
];

/** The same line for GIR; `oneBallPerSide` replaces the per-team maximum. */
export const GIR_STATUS_CASES: GirStatusCase[] = [
  { maxPerTeam: 1, oneBallPerSide: false, savedBy: null, offline: false, text: 'Svaret deles med kampen. Hvert lag får poeng for høyst 1.' },
  { maxPerTeam: 1, oneBallPerSide: false, savedBy: null, offline: true, text: 'Svaret deles med kampen. Hvert lag får poeng for høyst 1.' },
  { maxPerTeam: 1, oneBallPerSide: false, savedBy: SAVED_BY_ME, offline: false, text: 'Lagret av deg. Hvert lag får poeng for høyst 1.' },
  { maxPerTeam: 1, oneBallPerSide: false, savedBy: SAVED_BY_ME, offline: true, text: 'Lagret av deg.' },
  { maxPerTeam: 1, oneBallPerSide: false, savedBy: SAVED_BY_MARTE, offline: false, text: 'Lagret av Marte. Hvert lag får poeng for høyst 1.' },
  { maxPerTeam: 1, oneBallPerSide: false, savedBy: SAVED_BY_MARTE, offline: true, text: 'Lagret av Marte.' },
  { maxPerTeam: 1, oneBallPerSide: false, savedBy: SAVED_BY_UNNAMED, offline: false, text: 'Lagret. Hvert lag får poeng for høyst 1.' },
  { maxPerTeam: 1, oneBallPerSide: false, savedBy: SAVED_BY_UNNAMED, offline: true, text: 'Lagret.' },
  { maxPerTeam: 2, oneBallPerSide: false, savedBy: null, offline: false, text: 'Svaret deles med kampen. Hvert lag får poeng for høyst 2.' },
  { maxPerTeam: 2, oneBallPerSide: false, savedBy: null, offline: true, text: 'Svaret deles med kampen. Hvert lag får poeng for høyst 2.' },
  { maxPerTeam: 2, oneBallPerSide: false, savedBy: SAVED_BY_ME, offline: false, text: 'Lagret av deg. Hvert lag får poeng for høyst 2.' },
  { maxPerTeam: 2, oneBallPerSide: false, savedBy: SAVED_BY_ME, offline: true, text: 'Lagret av deg.' },
  { maxPerTeam: 2, oneBallPerSide: false, savedBy: SAVED_BY_MARTE, offline: false, text: 'Lagret av Marte. Hvert lag får poeng for høyst 2.' },
  { maxPerTeam: 2, oneBallPerSide: false, savedBy: SAVED_BY_MARTE, offline: true, text: 'Lagret av Marte.' },
  { maxPerTeam: 2, oneBallPerSide: false, savedBy: SAVED_BY_UNNAMED, offline: false, text: 'Lagret. Hvert lag får poeng for høyst 2.' },
  { maxPerTeam: 2, oneBallPerSide: false, savedBy: SAVED_BY_UNNAMED, offline: true, text: 'Lagret.' },
  { maxPerTeam: 3, oneBallPerSide: false, savedBy: null, offline: false, text: 'Svaret deles med kampen. Hvert lag får poeng for høyst 3.' },
  { maxPerTeam: 3, oneBallPerSide: false, savedBy: null, offline: true, text: 'Svaret deles med kampen. Hvert lag får poeng for høyst 3.' },
  { maxPerTeam: 3, oneBallPerSide: false, savedBy: SAVED_BY_ME, offline: false, text: 'Lagret av deg. Hvert lag får poeng for høyst 3.' },
  { maxPerTeam: 3, oneBallPerSide: false, savedBy: SAVED_BY_ME, offline: true, text: 'Lagret av deg.' },
  { maxPerTeam: 3, oneBallPerSide: false, savedBy: SAVED_BY_MARTE, offline: false, text: 'Lagret av Marte. Hvert lag får poeng for høyst 3.' },
  { maxPerTeam: 3, oneBallPerSide: false, savedBy: SAVED_BY_MARTE, offline: true, text: 'Lagret av Marte.' },
  { maxPerTeam: 3, oneBallPerSide: false, savedBy: SAVED_BY_UNNAMED, offline: false, text: 'Lagret. Hvert lag får poeng for høyst 3.' },
  { maxPerTeam: 3, oneBallPerSide: false, savedBy: SAVED_BY_UNNAMED, offline: true, text: 'Lagret.' },
  { maxPerTeam: 2, oneBallPerSide: true, savedBy: null, offline: false, text: 'Svaret deles med kampen. Laget spiller én ball, så det teller én gang.' },
  { maxPerTeam: 2, oneBallPerSide: true, savedBy: null, offline: true, text: 'Svaret deles med kampen. Laget spiller én ball, så det teller én gang.' },
  { maxPerTeam: 2, oneBallPerSide: true, savedBy: SAVED_BY_ME, offline: false, text: 'Lagret av deg. Laget spiller én ball, så det teller én gang.' },
  { maxPerTeam: 2, oneBallPerSide: true, savedBy: SAVED_BY_ME, offline: true, text: 'Lagret av deg.' },
  { maxPerTeam: 2, oneBallPerSide: true, savedBy: SAVED_BY_MARTE, offline: false, text: 'Lagret av Marte. Laget spiller én ball, så det teller én gang.' },
  { maxPerTeam: 2, oneBallPerSide: true, savedBy: SAVED_BY_MARTE, offline: true, text: 'Lagret av Marte.' },
  { maxPerTeam: 2, oneBallPerSide: true, savedBy: SAVED_BY_UNNAMED, offline: false, text: 'Lagret. Laget spiller én ball, så det teller én gang.' },
  { maxPerTeam: 2, oneBallPerSide: true, savedBy: SAVED_BY_UNNAMED, offline: true, text: 'Lagret.' },
];

/** The answer in the row. */
export const SIDE_ANSWER_CASES: SideAnswerCase[] = [
  { category: 'closest_to_pin', name: null, distanceM: null, text: 'Ingen på green' },
  { category: 'closest_to_pin', name: null, distanceM: 0.1, text: 'Ingen på green' },
  { category: 'closest_to_pin', name: null, distanceM: 2, text: 'Ingen på green' },
  { category: 'closest_to_pin', name: null, distanceM: 2.5, text: 'Ingen på green' },
  { category: 'closest_to_pin', name: null, distanceM: 11.5, text: 'Ingen på green' },
  { category: 'closest_to_pin', name: null, distanceM: 99.9, text: 'Ingen på green' },
  { category: 'closest_to_pin', name: 'Marte', distanceM: null, text: 'Marte' },
  { category: 'closest_to_pin', name: 'Marte', distanceM: 0.1, text: 'Marte · 0,1 m' },
  { category: 'closest_to_pin', name: 'Marte', distanceM: 2, text: 'Marte · 2,0 m' },
  { category: 'closest_to_pin', name: 'Marte', distanceM: 2.5, text: 'Marte · 2,5 m' },
  { category: 'closest_to_pin', name: 'Marte', distanceM: 11.5, text: 'Marte · 11,5 m' },
  { category: 'closest_to_pin', name: 'Marte', distanceM: 99.9, text: 'Marte · 99,9 m' },
  { category: 'closest_to_pin', name: 'Deg', distanceM: null, text: 'Deg' },
  { category: 'closest_to_pin', name: 'Deg', distanceM: 0.1, text: 'Deg · 0,1 m' },
  { category: 'closest_to_pin', name: 'Deg', distanceM: 2, text: 'Deg · 2,0 m' },
  { category: 'closest_to_pin', name: 'Deg', distanceM: 2.5, text: 'Deg · 2,5 m' },
  { category: 'closest_to_pin', name: 'Deg', distanceM: 11.5, text: 'Deg · 11,5 m' },
  { category: 'closest_to_pin', name: 'Deg', distanceM: 99.9, text: 'Deg · 99,9 m' },
  { category: 'longest_drive', name: null, distanceM: null, text: 'Ingen på fairway' },
  { category: 'longest_drive', name: null, distanceM: 0.1, text: 'Ingen på fairway' },
  { category: 'longest_drive', name: null, distanceM: 2, text: 'Ingen på fairway' },
  { category: 'longest_drive', name: null, distanceM: 2.5, text: 'Ingen på fairway' },
  { category: 'longest_drive', name: null, distanceM: 11.5, text: 'Ingen på fairway' },
  { category: 'longest_drive', name: null, distanceM: 99.9, text: 'Ingen på fairway' },
  { category: 'longest_drive', name: 'Marte', distanceM: null, text: 'Marte' },
  { category: 'longest_drive', name: 'Marte', distanceM: 0.1, text: 'Marte · 0,1 m' },
  { category: 'longest_drive', name: 'Marte', distanceM: 2, text: 'Marte · 2,0 m' },
  { category: 'longest_drive', name: 'Marte', distanceM: 2.5, text: 'Marte · 2,5 m' },
  { category: 'longest_drive', name: 'Marte', distanceM: 11.5, text: 'Marte · 11,5 m' },
  { category: 'longest_drive', name: 'Marte', distanceM: 99.9, text: 'Marte · 99,9 m' },
  { category: 'longest_drive', name: 'Deg', distanceM: null, text: 'Deg' },
  { category: 'longest_drive', name: 'Deg', distanceM: 0.1, text: 'Deg · 0,1 m' },
  { category: 'longest_drive', name: 'Deg', distanceM: 2, text: 'Deg · 2,0 m' },
  { category: 'longest_drive', name: 'Deg', distanceM: 2.5, text: 'Deg · 2,5 m' },
  { category: 'longest_drive', name: 'Deg', distanceM: 11.5, text: 'Deg · 11,5 m' },
  { category: 'longest_drive', name: 'Deg', distanceM: 99.9, text: 'Deg · 99,9 m' },
];

/** The answer in the GIR row. */
export const GIR_ANSWER_CASES: GirAnswerCase[] = [
  { hits: 0, balls: 4, allMissed: true, text: 'Ingen traff greenen' },
  { hits: 1, balls: 4, allMissed: false, text: '1 av 4 traff' },
  { hits: 2, balls: 4, allMissed: false, text: '2 av 4 traff' },
  { hits: 4, balls: 4, allMissed: false, text: '4 av 4 traff' },
  { hits: 1, balls: 2, allMissed: false, text: '1 av 2 traff' },
];

/**
 * The distance with Norwegian comma and one decimal. The database holds `numeric(3,1)`, 0,1 to 99,9: every tenth
 * of the first metre, the ends of each range, and values where float rounding could bite.
 */
export const DISTANCE_CASES: DistanceCase[] = [
  { distanceM: 0.1, text: '0,1' },
  { distanceM: 0.2, text: '0,2' },
  { distanceM: 0.3, text: '0,3' },
  { distanceM: 0.4, text: '0,4' },
  { distanceM: 0.5, text: '0,5' },
  { distanceM: 0.6, text: '0,6' },
  { distanceM: 0.7, text: '0,7' },
  { distanceM: 0.8, text: '0,8' },
  { distanceM: 0.9, text: '0,9' },
  { distanceM: 1, text: '1,0' },
  { distanceM: 1.1, text: '1,1' },
  { distanceM: 1.5, text: '1,5' },
  { distanceM: 1.8, text: '1,8' },
  { distanceM: 2, text: '2,0' },
  { distanceM: 2.4, text: '2,4' },
  { distanceM: 2.5, text: '2,5' },
  { distanceM: 3.3, text: '3,3' },
  { distanceM: 4.4, text: '4,4' },
  { distanceM: 5, text: '5,0' },
  { distanceM: 5.5, text: '5,5' },
  { distanceM: 6.6, text: '6,6' },
  { distanceM: 7.7, text: '7,7' },
  { distanceM: 8.8, text: '8,8' },
  { distanceM: 9.9, text: '9,9' },
  { distanceM: 10, text: '10,0' },
  { distanceM: 10.1, text: '10,1' },
  { distanceM: 11.5, text: '11,5' },
  { distanceM: 12.3, text: '12,3' },
  { distanceM: 19.9, text: '19,9' },
  { distanceM: 20, text: '20,0' },
  { distanceM: 25.5, text: '25,5' },
  { distanceM: 33.3, text: '33,3' },
  { distanceM: 45.6, text: '45,6' },
  { distanceM: 50, text: '50,0' },
  { distanceM: 66.6, text: '66,6' },
  { distanceM: 70.7, text: '70,7' },
  { distanceM: 88.8, text: '88,8' },
  { distanceM: 99.8, text: '99,8' },
  { distanceM: 99.9, text: '99,9' },
];

/** «Deg og Marte», the names of a foursomes side. */
export const NAME_LIST_CASES: NameListCase[] = [
  { names: [], text: '' },
  { names: ['Deg'], text: 'Deg' },
  { names: ['Deg', 'Marte'], text: 'Deg og Marte' },
  { names: ['Deg', 'Marte', 'Tore'], text: 'Deg, Marte og Tore' },
  { names: ['Ola', 'Marte', 'Tore', 'Kari'], text: 'Ola, Marte, Tore og Kari' },
];

/** What the player is told when a report was not saved: every code, in a game («flighten») and in a match («kampen»). */
export const FAILURE_CASES: FailureCase[] = [
  { failure: 'not_authenticated', contest: GAME_CTP, text: 'Du er ikke logget inn lenger. Logg inn på nytt.' },
  { failure: 'not_authenticated', contest: CUP_CTP, text: 'Du er ikke logget inn lenger. Logg inn på nytt.' },
  { failure: 'not_active', contest: GAME_CTP, text: 'Runden er avsluttet. Nå kan ingenting registreres mer.' },
  { failure: 'not_active', contest: CUP_CTP, text: 'Runden er avsluttet. Nå kan ingenting registreres mer.' },
  { failure: 'not_player', contest: GAME_CTP, text: 'Du er ikke med i flighten lenger, så svaret ble ikke lagret.' },
  { failure: 'not_player', contest: CUP_CTP, text: 'Du er ikke med i kampen lenger, så svaret ble ikke lagret.' },
  { failure: 'wrong_flight', contest: GAME_CTP, text: 'Spilleren er ikke med i flighten din lenger, så svaret ble ikke lagret.' },
  { failure: 'wrong_flight', contest: CUP_CTP, text: 'Spilleren er ikke med i kampen din lenger, så svaret ble ikke lagret.' },
  { failure: 'no_slot', contest: GAME_CTP, text: 'Hullet har ikke sidekonkurranse lenger, så svaret ble ikke lagret.' },
  { failure: 'no_slot', contest: CUP_CTP, text: 'Hullet har ikke sidekonkurranse lenger, så svaret ble ikke lagret.' },
  { failure: 'bad_distance', contest: GAME_CTP, text: 'Avstanden må være mellom 0,1 og 99,9 meter.' },
  { failure: 'bad_distance', contest: CUP_CTP, text: 'Avstanden må være mellom 0,1 og 99,9 meter.' },
  { failure: 'db_error', contest: GAME_CTP, text: 'Fikk ikke lagret. Sjekk nettet og prøv igjen.' },
  { failure: 'db_error', contest: CUP_CTP, text: 'Fikk ikke lagret. Sjekk nettet og prøv igjen.' },
];

/**
 * The finish page's «Meldt inn fra flightene»: the lines (flight, name or «Ingen på …», distance) and the flights
 * that have not reported. A game with one flight reports under flight 0, shown as «Flighten».
 */
export const REPORTED_BOX_CASES: ReportedBoxCase[] = [
  {
    category: 'longest_drive',
    hole: 9,
    lines: [
      { flightNumber: 1, name: 'Jonas', distanceM: null, flight: 'Flight 1', nameText: 'Jonas', distanceText: null },
      { flightNumber: 2, name: null, distanceM: null, flight: 'Flight 2', nameText: 'Ingen på fairway', distanceText: null },
      { flightNumber: 3, name: 'Kristian', distanceM: 0.1, flight: 'Flight 3', nameText: 'Kristian', distanceText: '0,1 m' },
      { flightNumber: 4, name: 'Marte', distanceM: 1.8, flight: 'Flight 4', nameText: 'Marte', distanceText: '1,8 m' },
      { flightNumber: 5, name: 'Tore', distanceM: 2, flight: 'Flight 5', nameText: 'Tore', distanceText: '2,0 m' },
      { flightNumber: 6, name: 'Kari', distanceM: 11.5, flight: 'Flight 6', nameText: 'Kari', distanceText: '11,5 m' },
      { flightNumber: 7, name: 'Ola', distanceM: 99.9, flight: 'Flight 7', nameText: 'Ola', distanceText: '99,9 m' },
      { flightNumber: 0, name: 'Siri', distanceM: 2.4, flight: 'Flighten', nameText: 'Siri', distanceText: '2,4 m' },
    ],
    missing: [
      { flightNumber: 8, text: 'Flight 8 har ikke meldt inn' },
      { flightNumber: 0, text: 'Flighten har ikke meldt inn' },
    ],
  },
  {
    category: 'closest_to_pin',
    hole: 7,
    lines: [
      { flightNumber: 2, name: null, distanceM: null, flight: 'Flight 2', nameText: 'Ingen på green', distanceText: null },
    ],
    missing: [
      { flightNumber: 1, text: 'Flight 1 har ikke meldt inn' },
    ],
  },
];

/** The box when no flight has reported. */
export const REPORTED_NONE_CASES: ReportedNoneCase[] = [
  { hole: 7, text: 'Ingen flight har meldt inn på hull 7.' },
];

/** The slot's label in the finish form, with and without a hole. */
export const SLOT_LABEL_CASES: SlotLabelCase[] = [
  { category: 'longest_drive', position: 1, hole: 9, text: 'Lengste drive #1 · hull 9' },
  { category: 'longest_drive', position: 2, hole: null, text: 'Lengste drive #2' },
  { category: 'closest_to_pin', position: 1, hole: 7, text: 'Nærmest pinnen #1 · hull 7' },
  { category: 'closest_to_pin', position: 2, hole: null, text: 'Nærmest pinnen #2' },
];
