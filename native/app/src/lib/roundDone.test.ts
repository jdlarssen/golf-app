// #2299: oppsummeringen øverst på scorekortet. Reglene under (beste og verste
// hull, flighten, tallet som står først) er låst i
// `lib/scorecard/roundSummary.test.ts`, og plassen i `homeHero.test.ts`. Her
// låses bare når appen viser kortet, hva vaktene skjuler, og hullteksten.
import type { ScorecardGridTotals } from '../../../../lib/scorecard/scorecardGrid';
import type { RoundHighlight } from '../../../../lib/scorecard/roundSummary';
import type { LocalScore } from '../data/db';
import type { BundleGame, BundlePlayer } from '../data/gameBundle';
import { holeScores, homeBundle, homePlayer } from '../test/homeFixtures';
import {
  birdieUnit,
  buildRoundDoneModel,
  highlightSpoken,
  highlightText,
  missingSpoken,
  placeSpoken,
  placeUnit,
  roundDoneBarVisible,
  submitInView,
} from './roundDone';
import type { ScorecardRow } from './scorecardRows';

const ME = 'me';
const GAME = 'g-live';

/** 18 hull på par 4, 4 slag på hvert, så ingen hull skiller seg ut. */
function rows(strokes: (number | null)[] = Array(18).fill(4)): ScorecardRow[] {
  return strokes.map((s, i) => ({
    holeNumber: i + 1,
    par: 4,
    strokeIndex: i + 1,
    strokes: s,
    extra: 0,
    netto: s,
    enteredBy: s == null ? null : ME,
  }));
}

const TOTALS: ScorecardGridTotals = { played: 18, holeCount: 18, brutto: 72, netto: 72, points: 36 };

function model(opts: {
  game?: Partial<BundleGame>;
  players?: BundlePlayer[];
  totals?: Partial<ScorecardGridTotals>;
  canSubmit?: boolean;
  missing?: number;
  revealActive?: boolean;
  teamMode?: boolean;
  /** Slagene på enheten; uten dem har alle ført alle 18 hull. */
  scores?: LocalScore[];
}) {
  const players = opts.players ?? [homePlayer({ userId: ME }), homePlayer({ userId: 'mate' })];
  const scores = opts.scores ?? players.flatMap((p) => holeScores(GAME, p.userId, 18, 4));
  return buildRoundDoneModel({
    bundle: homeBundle({ game: opts.game, players }),
    scores,
    localScores: scores,
    userId: ME,
    rows: rows(),
    totals: { ...TOTALS, ...opts.totals },
    revealActive: opts.revealActive ?? false,
    canSubmit: opts.canSubmit ?? true,
    missing: opts.missing ?? 0,
    teamMode: opts.teamMode ?? false,
  });
}

/** Seks spillere i to flighter er et stort felt (`isSingleFlightGame` sier nei). */
const bigField = (flight: number | null) => [
  homePlayer({ userId: ME, flightNumber: flight }),
  ...['a', 'b', 'c', 'd', 'e'].map((id) => homePlayer({ userId: id, flightNumber: 1 })),
];

describe('buildRoundDoneModel', () => {
  it.each([
    {
      name: 'ett hull uten slag gir ingen oppsummering',
      run: () => model({ missing: 1 }),
      check: (m: ReturnType<typeof model>) => expect(m).toBeNull(),
    },
    {
      name: 'et levert kort (kan ikke leveres herfra) gir ingen oppsummering',
      run: () => model({ canSubmit: false }),
      check: (m: ReturnType<typeof model>) => expect(m).toBeNull(),
    },
    {
      name: 'blind runde: slag først, og ingen plass',
      run: () =>
        model({
          game: { scoreVisibility: 'reveal' },
          revealActive: true,
          totals: { points: null, netto: null },
        }),
      check: (m: ReturnType<typeof model>) =>
        expect(m).toMatchObject({ headline: { kind: 'gross' }, standing: null }),
    },
    {
      name: 'lagkort: ingen plass',
      run: () =>
        model({
          game: { gameMode: 'texas_scramble' },
          players: [homePlayer({ userId: ME, teamNumber: 1 }), homePlayer({ userId: 'mate', teamNumber: 1 })],
          teamMode: true,
        }),
      check: (m: ReturnType<typeof model>) =>
        expect(m).toMatchObject({ headline: { kind: 'gross' }, standing: null }),
    },
    {
      name: 'uten flight i et stort felt: ingen flight-liste',
      run: () => model({ players: bigField(null) }),
      check: (m: ReturnType<typeof model>) => expect(m?.flight).toBeNull(),
    },
    {
      name: 'med flight i et stort felt: lista har flighten',
      run: () => model({ players: bigField(1) }),
      check: (m: ReturnType<typeof model>) =>
        expect(m?.flight).toEqual([{ kind: 'complete', names: expect.stringMatching(/\S/) }]),
    },
    {
      name: 'flighten: ført alt, så levert, så den som mangler hull 17',
      run: () => {
        const players = [
          homePlayer({ userId: ME }),
          homePlayer({ userId: 'jonas', name: 'Jonas Berg' }),
          homePlayer({ userId: 'kari', name: 'Kari Nord', submittedAt: '2026-10-14T12:00:00.000Z' }),
          homePlayer({ userId: 'marte', name: 'Marte Lie' }),
        ];
        return model({
          players,
          scores: [
            ...holeScores(GAME, ME, 18, 4),
            ...holeScores(GAME, 'jonas', 16, 4),
            ...holeScores(GAME, 'jonas', 18, 4, 18),
            ...holeScores(GAME, 'kari', 18, 4),
            ...holeScores(GAME, 'marte', 18, 4),
          ],
        });
      },
      check: (m: ReturnType<typeof model>) =>
        expect(m?.flight).toEqual([
          { kind: 'complete', names: 'Marte' },
          { kind: 'submitted', names: 'Kari' },
          { kind: 'missing', userId: 'jonas', name: 'Jonas', holes: [17], firstHole: 17 },
        ]),
    },
    {
      name: 'to i flighten med samme kortnavn får hele navnet',
      run: () =>
        model({
          players: [
            homePlayer({ userId: ME }),
            homePlayer({ userId: 'jb', name: 'Jonas Berg' }),
            homePlayer({ userId: 'jr', name: 'Jonas Rud' }),
            homePlayer({ userId: 'marte', name: 'Marte Lie' }),
          ],
        }),
      check: (m: ReturnType<typeof model>) =>
        expect(m?.flight).toEqual([{ kind: 'complete', names: 'Jonas Berg, Jonas Rud og Marte' }]),
    },
    {
      name: 'to med samme kallenavn får hele navnet',
      run: () =>
        model({
          players: [
            homePlayer({ userId: ME }),
            homePlayer({ userId: 'pp', name: 'Per Putter', nickname: 'Jonas' }),
            homePlayer({ userId: 'kn', name: 'Kari Nord', nickname: 'Jonas' }),
            homePlayer({ userId: 'marte', name: 'Marte Lie' }),
          ],
        }),
      check: (m: ReturnType<typeof model>) =>
        expect(m?.flight).toEqual([{ kind: 'complete', names: 'Per Putter, Kari Nord og Marte' }]),
    },
    {
      name: 'fullt kort uten netto faller til slag',
      run: () => model({ game: { gameMode: 'solo_strokeplay' }, totals: { netto: null } }),
      check: (m: ReturnType<typeof model>) => expect(m?.headline.kind).toBe('gross'),
    },
    {
      name: 'live stableford: poeng først og plassen fra tavla',
      run: () => model({}),
      check: (m: ReturnType<typeof model>) => {
        expect(m?.headline.kind).toBe('points');
        expect(m?.standing).not.toBeNull();
      },
    },
  ])('$name', ({ run, check }) => {
    check(run());
  });
});

describe('highlightText', () => {
  const hole = (h: Partial<RoundHighlight>): RoundHighlight => ({
    holeNumber: 7,
    strokes: 3,
    par: 3,
    term: 'par',
    holeInOne: false,
    ...h,
  });

  it.each([
    { name: 'par', h: hole({ holeNumber: 4 }), which: 'best', text: 'Hull 4 · par' },
    {
      name: 'birdie',
      h: hole({ strokes: 2, term: 'birdie' }),
      which: 'best',
      text: 'Hull 7 · birdie på par 3',
    },
    {
      name: 'hole-in-one',
      h: hole({ strokes: 1, term: 'eagle', holeInOne: true }),
      which: 'best',
      text: 'Hull 7 · hole-in-one',
    },
    {
      name: 'dobbel',
      h: hole({ holeNumber: 13, strokes: 6, par: 4, term: 'doubleBogey' }),
      which: 'worst',
      text: 'Hull 13 · dobbel',
    },
    {
      name: 'trippel',
      h: hole({ holeNumber: 13, strokes: 7, par: 4, term: 'tripleBogey' }),
      which: 'worst',
      text: 'Hull 13 · trippel',
    },
    {
      name: 'over: bare diffen',
      h: hole({ holeNumber: 13, strokes: 8, par: 4, term: 'over' }),
      which: 'worst',
      text: 'Hull 13 · +4',
    },
  ] as const)('$name', ({ h, which, text }) => {
    expect(highlightText(h, which)).toBe(text);
  });
});

describe('tekstene', () => {
  const birdie: RoundHighlight = { holeNumber: 7, strokes: 2, par: 3, term: 'birdie', holeInOne: false };

  it.each([
    { name: 'én birdie i entall', text: birdieUnit(1), expected: 'birdie' },
    { name: 'flere birdier', text: birdieUnit(2), expected: 'birdier' },
    { name: 'delt plass under tallet', text: placeUnit({ tied: true }), expected: 'delt plass nå' },
    { name: 'delt plass for skjermleseren', text: placeSpoken({ rank: 3, tied: true }), expected: 'delt 3. plass nå' },
    { name: 'plass uten likhet', text: placeSpoken({ rank: 3, tied: false }), expected: '3. plass nå' },
    {
      name: 'høydepunktet med liten forbokstav etter kolon',
      text: highlightSpoken(birdie, 'best'),
      expected: 'Dagens beste hull: hull 7, birdie på par 3',
    },
    {
      name: 'raden som mangler hull',
      text: missingSpoken({ name: 'Jonas', holes: [3, 17], firstHole: 3 }),
      expected: 'Jonas mangler hull 3 og 17. Åpne hull 3.',
    },
  ])('$name', ({ text, expected }) => {
    expect(text).toBe(expected);
  });
});

describe('bunnlinja', () => {
  // Rulla er 600 pt høy; scorekortets «Lever scorekort» står 1100 pt ned i innholdet.
  it.each([
    { name: 'øverst: knappen er under rulla', g: { scrollY: 0, viewportHeight: 600, submitTop: 1100 }, inView: false },
    { name: 'knappen står akkurat i underkanten', g: { scrollY: 500, viewportHeight: 600, submitTop: 1100 }, inView: false },
    { name: 'ett punkt til: knappen er i syne', g: { scrollY: 501, viewportHeight: 600, submitTop: 1100 }, inView: true },
    { name: 'linja har veket, rulla er høyere', g: { scrollY: 400, viewportHeight: 737, submitTop: 1100 }, inView: true },
    { name: 'knappens plass er ikke målt ennå', g: { scrollY: 900, viewportHeight: 600, submitTop: null }, inView: false },
    { name: 'rulla er ikke målt ennå', g: { scrollY: 0, viewportHeight: 0, submitTop: 1100 }, inView: false },
  ])('$name', ({ g, inView }) => {
    expect(submitInView(g)).toBe(inView);
  });

  it.each([
    { name: 'oppsummeringen vises, knappen er ikke i syne', hasSummary: true, inView: false, shown: true },
    { name: 'knappen er i syne: linja viker', hasSummary: true, inView: true, shown: false },
    { name: 'ingen oppsummering (17 hull eller levert)', hasSummary: false, inView: false, shown: false },
  ])('$name', ({ hasSummary, inView, shown }) => {
    expect(roundDoneBarVisible({ hasSummary, submitInView: inView })).toBe(shown);
  });
});
