// #2299: oppsummeringen øverst på scorekortet. Reglene under (beste og verste
// hull, flighten, tallet som står først) er låst i
// `lib/scorecard/roundSummary.test.ts`, og plassen i `homeHero.test.ts`. Her
// låses bare når appen viser kortet, hva vaktene skjuler, og hullteksten.
import type { ScorecardGridTotals } from '../../../../lib/scorecard/scorecardGrid';
import type { RoundHighlight } from '../../../../lib/scorecard/roundSummary';
import type { BundleGame, BundlePlayer } from '../data/gameBundle';
import { holeScores, homeBundle, homePlayer } from '../test/homeFixtures';
import { buildRoundDoneModel, highlightText } from './roundDone';
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
}) {
  const players = opts.players ?? [homePlayer({ userId: ME }), homePlayer({ userId: 'mate' })];
  const scores = players.flatMap((p) => holeScores(GAME, p.userId, 18, 4));
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
        expect(m?.flight).toEqual([{ kind: 'complete', names: expect.any(String) }]),
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
