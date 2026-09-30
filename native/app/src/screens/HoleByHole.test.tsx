// #2255 PR 3a: den ene render-testen (Type C) for «Hull for hull» i appen.
//
// Hva radene, deltotalene og hullvinneren ER, låses i `soloScorecard.test.ts`
// (webbens og appens felles modell). Her låses koblingen: overskriften, at
// stillingen og begge niene kommer på skjermen, at stjerna er dekor, og at en
// blind runde som pågår holder alt tilbake.
/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock-factories heises over importene og må bruke require */
import { render, screen, waitFor } from '@testing-library/react-native';
import type { GameBundle } from '../data/gameBundle';
import type { ScreenProps } from '../navigation';
import { holeScores, homeBundle, homePlayer } from '../test/homeFixtures';
import { PALETTES } from '../theme';
import { HoleByHole, HoleByHoleBody } from './HoleByHole';

jest.mock('../supabase', () => require('../test/supabaseMock'));
// Skjermen rundt kroppen: bundel og slag fra enheten, og hentingen av slagene.
const mockScreen: {
  bundle: GameBundle | null;
  scores: unknown[];
  seed: () => Promise<number>;
  extras: Record<string, unknown>;
  choicesFailed: boolean;
} = {
  bundle: null,
  scores: [],
  seed: async () => 0,
  extras: {},
  choicesFailed: false,
};
// Valgene (Wolf) hentes med fokus og polling; her leverer testen dem selv.
jest.mock('../lib/useChoices', () => ({
  ...jest.requireActual('../lib/useChoices'),
  useGameChoices: () => ({
    extras: mockScreen.extras,
    refresh: async () => undefined,
    failed: mockScreen.choicesFailed,
  }),
}));
jest.mock('../lib/useGameData', () => ({
  useGameBundle: () => ({ bundle: mockScreen.bundle, loading: false }),
  useLocalScores: () => ({ scores: mockScreen.scores, reload: mockReload }),
}));
const mockReload = jest.fn();
const mockNavigation = { setOptions: jest.fn() };
jest.mock('../data/seedScores', () => ({ seedGameScores: () => mockScreen.seed() }));

const HIDDEN = { includeHiddenElements: true };

const players = [
  homePlayer({ userId: 'ola', name: 'Ola Kompis', courseHandicap: 0 }),
  homePlayer({ userId: 'kari', name: 'Kari Nordmann', courseHandicap: 0 }),
];
const stableford = { gameMode: 'stableford', modeConfig: { kind: 'stableford', team_size: 1, points_table: 'standard' } };
// Ola 4 slag (par, 2 p) på hull 1–3, Kari 5 slag (1 p) på hull 1–2.
const scores = [...holeScores('g1', 'ola', 3, 4), ...holeScores('g1', 'kari', 2, 5)];

it('avsluttet solo stableford: overskrift, stilling, Ut og Inn, og hullvinneren med stjerne', async () => {
  const bundle = homeBundle({ game: { id: 'g1', status: 'finished', ...stableford }, players });
  await render(<HoleByHoleBody bundle={bundle} scores={scores} />);

  expect(screen.getByRole('header', { name: 'Hull for hull' })).toBeTruthy();
  expect(screen.getByTestId('hole-by-hole-standing-ola')).toBeTruthy();
  expect(screen.getByTestId('hole-by-hole-standing-kari')).toBeTruthy();
  expect(screen.getByTestId('hole-by-hole-front9')).toBeTruthy();
  expect(screen.getByTestId('hole-by-hole-back9')).toBeTruthy();
  expect(screen.getByTestId('hole-by-hole-front9-subtotal-ola')).toBeTruthy();
  // Hull 1: Ola alene best. Stjerna er dekor for skjermleseren.
  expect(screen.queryByTestId('hole-by-hole-best-1')).toBeNull();
  expect(screen.getByTestId('hole-by-hole-best-1', HIDDEN)).toBeTruthy();
  expect(screen.getAllByTestId(/^hole-by-hole-card-/)).toHaveLength(18);
  // Bunnteksten som på webben (`LeaderboardFooter`, i anførselstegn).
  expect(screen.getByTestId('hole-by-hole-footer')).toHaveTextContent('«Vel spilt!»');
});

it('blind runde som pågår: alt holdes tilbake', async () => {
  const bundle = homeBundle({
    game: { id: 'g1', status: 'active', scoreVisibility: 'reveal', ...stableford },
    players,
  });
  await render(<HoleByHoleBody bundle={bundle} scores={scores} />);
  expect(screen.getByTestId('hole-by-hole-reveal-hidden')).toBeTruthy();
  expect(screen.queryByTestId('hole-by-hole')).toBeNull();
});

it('et format appen ikke har «Hull for hull» for: en rolig linje', async () => {
  const bundle = homeBundle({
    game: { id: 'g1', status: 'finished', gameMode: 'wolf', modeConfig: { kind: 'wolf' } },
    players,
  });
  await render(<HoleByHoleBody bundle={bundle} scores={[]} />);
  expect(screen.getByTestId('hole-by-hole-unavailable')).toBeTruthy();
});

describe('hentingen av slagene', () => {
  beforeEach(() => {
    mockReload.mockClear();
    mockScreen.extras = {};
    mockScreen.choicesFailed = false;
  });
  const props = { route: { params: { gameId: 'g1' } }, navigation: mockNavigation } as unknown as ScreenProps<'HoleByHole'>;
  const finished = () =>
    homeBundle({ game: { id: 'g1', status: 'finished', ...stableford }, players });

  it('mens den pågår og telefonen ikke har noe: et hjul, ikke et tomt kort', async () => {
    mockScreen.bundle = finished();
    mockScreen.scores = [];
    mockScreen.seed = () => new Promise(() => undefined);
    await render(<HoleByHole {...props} />);
    // Hjulet, ikke feilteksten «Fikk ikke tak i spillet.» som deler blokka.
    expect(screen.getByTestId('hole-by-hole-spinner')).toBeTruthy();
    expect(screen.queryByTestId('hole-by-hole-screen')).toBeNull();
  });

  it('feiler den (uten nett): kortet med telefonens slag, og en linje som sier det', async () => {
    mockScreen.bundle = finished();
    mockScreen.scores = scores;
    mockScreen.seed = () => Promise.reject(new Error('nett'));
    await render(<HoleByHole {...props} />);
    await waitFor(() => expect(screen.getByTestId('hole-by-hole-seed-failed')).toBeTruthy());
    expect(screen.getByTestId('hole-by-hole-front9')).toBeTruthy();
  });

  it('lykkes den: ingen linje', async () => {
    mockScreen.bundle = finished();
    mockScreen.scores = scores;
    mockScreen.seed = async () => 5;
    await render(<HoleByHole {...props} />);
    await waitFor(() => expect(mockReload).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId('hole-by-hole-front9')).toBeTruthy();
    expect(screen.queryByTestId('hole-by-hole-seed-failed')).toBeNull();
  });
});

describe('Wolf (#2255 PR 3b)', () => {
  const wolfPlayers = ['a', 'b', 'c', 'd'].map((userId, i) =>
    homePlayer({ userId, name: userId.toUpperCase(), teamNumber: i + 1, courseHandicap: 0 }),
  );
  const wolfBundle = () =>
    homeBundle({
      game: {
        id: 'gw',
        status: 'finished',
        gameMode: 'wolf',
        modeConfig: { kind: 'wolf', team_size: 1, teams_count: 4, wolf_scoring: 'net' },
      },
      players: wolfPlayers,
    });
  const wolfScores = [
    ...holeScores('gw', 'a', 1, 4),
    ...holeScores('gw', 'b', 1, 5),
    ...holeScores('gw', 'c', 1, 5),
    ...holeScores('gw', 'd', 1, 6),
  ];
  const props = { route: { params: { gameId: 'gw' } }, navigation: mockNavigation } as unknown as ScreenProps<'HoleByHole'>;

  it('venter på valgene før noe regnes: uten dem kan motoren ikke regne Wolf', async () => {
    mockScreen.bundle = wolfBundle();
    mockScreen.scores = wolfScores;
    mockScreen.seed = async () => 0;
    mockScreen.extras = {};
    await render(<HoleByHole {...props} />);
    await waitFor(() => expect(mockReload).toHaveBeenCalled());
    expect(screen.getByTestId('hole-by-hole-spinner')).toBeTruthy();
    expect(screen.queryByTestId('hole-by-hole')).toBeNull();
  });

  it('uten nett, og valgene aldri hentet: en ærlig beskjed, ikke et hjul som aldri stopper', async () => {
    mockScreen.bundle = wolfBundle();
    mockScreen.scores = wolfScores;
    mockScreen.seed = async () => 0;
    mockScreen.extras = {};
    mockScreen.choicesFailed = true;
    await render(<HoleByHole {...props} />);
    await waitFor(() => expect(screen.getByTestId('hole-by-hole-choices-missing')).toBeTruthy());
    expect(screen.queryByTestId('hole-by-hole-spinner')).toBeNull();
    expect(screen.queryByTestId('hole-by-hole')).toBeNull();
    mockScreen.choicesFailed = false;
  });

  it('med valgene: ett kort per hull, ulven, valget og utfallet, og ulvens side først', async () => {
    const bundle = wolfBundle();
    await render(
      <HoleByHoleBody
        bundle={bundle}
        scores={wolfScores}
        extras={{ wolfChoices: [{ holeNumber: 1, wolfUserId: 'a', choice: 'partner', partnerUserId: 'b' }] }}
      />,
    );
    expect(screen.getByRole('header', { name: 'Hull for hull' })).toBeTruthy();
    expect(screen.getAllByTestId(/^hole-by-hole-card-/)).toHaveLength(18);
    expect(screen.getByTestId('hole-by-hole-wolf-1')).toHaveTextContent(/Wolf:.*A.*Partner: B.*Wolf vant/);
    const rows = screen.getAllByTestId(/^hole-by-hole-row-1-/).map((r) => r.props.testID);
    expect(rows.slice(0, 2)).toEqual(['hole-by-hole-row-1-a', 'hole-by-hole-row-1-b']);
    // Ingen innsats over 1 på hull 1.
    expect(screen.queryByTestId('hole-by-hole-stake-1')).toBeNull();
    // Bunnteksten som på webben: runden er ferdig.
    expect(screen.getByTestId('hole-by-hole-footer')).toHaveTextContent('«Vel spilt!»');
  });
});

describe('Nines (#2255 PR 3c)', () => {
  it('ett kort per hull med potten, plassen, score og poeng; lederne først', async () => {
    const bundle = homeBundle({
      game: {
        id: 'gn',
        status: 'finished',
        gameMode: 'nines',
        modeConfig: { kind: 'nines', team_size: 1, nines_variant: 'nines', nines_scoring: 'net' },
      },
      // Motsatt av stillingen, så motorens rekkefølge ikke er den ferdige.
      players: [
        homePlayer({ userId: 'c', name: 'C', courseHandicap: 0 }),
        homePlayer({ userId: 'b', name: 'B', courseHandicap: 18 }),
        homePlayer({ userId: 'a', name: 'A', courseHandicap: 0 }),
      ],
    });
    // Hull 1: A 4, B 5 med et slag (netto 4), C 5. A og B delt lavest: 4 poeng hver, C 1.
    const ninesScores = [
      ...holeScores('gn', 'a', 1, 4),
      ...holeScores('gn', 'b', 1, 5),
      ...holeScores('gn', 'c', 1, 5),
    ];
    await render(<HoleByHoleBody bundle={bundle} scores={ninesScores} />);

    expect(screen.getByRole('header', { name: 'Hull for hull' })).toBeTruthy();
    expect(screen.getByText('Nines · Netto')).toBeTruthy();
    expect(screen.getAllByTestId(/^hole-by-hole-card-/)).toHaveLength(18);
    expect(screen.getByTestId('hole-by-hole-pot-1')).toHaveTextContent('9 poeng');
    // Hull 2 er ikke spilt: ingen pott, men «Venter på score».
    expect(screen.queryByTestId('hole-by-hole-pot-2')).toBeNull();
    expect(screen.getByTestId('hole-by-hole-card-2')).toHaveTextContent(/Venter på score/);

    const rows = screen.getAllByTestId(/^hole-by-hole-row-1-/).map((r) => r.props.testID);
    expect(rows).toEqual(['hole-by-hole-row-1-a', 'hole-by-hole-row-1-b', 'hole-by-hole-row-1-c']);
    expect(screen.getByTestId('hole-by-hole-row-1-b')).toHaveTextContent(/B.*\+4.*brutto 5.*4/);
    // Plassen er dekor for skjermleseren, som på webben (aria-hidden).
    expect(screen.queryByTestId('hole-by-hole-place-1-c')).toBeNull();
    expect(screen.getByTestId('hole-by-hole-place-1-c', HIDDEN)).toHaveTextContent('3');
    expect(screen.getByTestId('hole-by-hole-place-2-a', HIDDEN)).toHaveTextContent('–');
    expect(screen.getByTestId('hole-by-hole-footer')).toHaveTextContent('«Vel spilt!»');
  });
});

describe('Round Robin (#2255 PR 3c)', () => {
  it('tre segmenter med partnerne, ett kort per hull med begge sidene, og vinnersiden', async () => {
    const bundle = homeBundle({
      game: {
        id: 'gr',
        status: 'finished',
        gameMode: 'round_robin',
        modeConfig: { kind: 'round_robin', team_size: 1, teams_count: 4, allowance_pct: 100 },
      },
      // Motsatt av rotasjonsplassene, så motorens rekkefølge inn ikke er den ferdige.
      players: [
        homePlayer({ userId: 'd', name: 'D', teamNumber: 4 }),
        homePlayer({ userId: 'c', name: 'C', teamNumber: 3, courseHandicap: 18 }),
        homePlayer({ userId: 'b', name: 'B', teamNumber: 2 }),
        homePlayer({ userId: 'a', name: 'A', teamNumber: 1 }),
      ],
    });
    // Hull 1 (A+B mot C+D): A 5, B 5, C 5 med et slag (netto 4), D 6. C+D vant.
    const rrScores = [
      ...holeScores('gr', 'a', 1, 5),
      ...holeScores('gr', 'b', 1, 5),
      ...holeScores('gr', 'c', 1, 5),
      ...holeScores('gr', 'd', 1, 6),
    ];
    await render(<HoleByHoleBody bundle={bundle} scores={rrScores} />);

    expect(screen.getByRole('header', { name: 'Hull for hull' })).toBeTruthy();
    expect(screen.getByText('Round Robin')).toBeTruthy();
    // Tre segmenter, hvert med hull-spennet og hvem som er partnere.
    expect(screen.getAllByTestId(/^hole-by-hole-segment-\d$/)).toHaveLength(3);
    expect(screen.getByTestId('hole-by-hole-segment-1')).toHaveTextContent(/^Segment 1 · Hull 1–6.*A \+ B.*C \+ D/);
    expect(screen.getByTestId('hole-by-hole-segment-2')).toHaveTextContent(/^Segment 2 · Hull 7–12.*A \+ C.*B \+ D/);
    expect(screen.getByTestId('hole-by-hole-segment-3')).toHaveTextContent(/^Segment 3 · Hull 13–18.*A \+ D.*B \+ C/);
    expect(screen.getAllByTestId(/^hole-by-hole-card-/)).toHaveLength(18);

    // Hull 1: C+D vant, markert på siden og ikke i hodet.
    expect(screen.queryByTestId('hole-by-hole-outcome-1')).toBeNull();
    expect(screen.getByTestId('hole-by-hole-side-1-2')).toHaveTextContent(/Vant hullet.*C.*brutto 5.*4.*D.*6/);
    expect(screen.getByTestId('hole-by-hole-side-1-1')).not.toHaveTextContent(/Vant hullet/);
    const rows = screen.getAllByTestId(/^hole-by-hole-row-1-/).map((r) => r.props.testID);
    expect(rows).toEqual([
      'hole-by-hole-row-1-a',
      'hole-by-hole-row-1-b',
      'hole-by-hole-row-1-c',
      'hole-by-hole-row-1-d',
    ]);
    // Stjerna (sidens beste) og «vs» er dekor for skjermleseren, som på webben (aria-hidden).
    expect(screen.queryByTestId('hole-by-hole-star-1-c')).toBeNull();
    expect(screen.getByTestId('hole-by-hole-star-1-c', HIDDEN)).toHaveTextContent('★');
    expect(screen.queryByTestId('hole-by-hole-star-1-d', HIDDEN)).toBeNull();
    expect(screen.queryByTestId('hole-by-hole-vs-1')).toBeNull();
    expect(screen.getByTestId('hole-by-hole-vs-1', HIDDEN)).toHaveTextContent('vs');
    // Hull 2 er ikke spilt: «Venter» i hodet, ingen vinner, netto som «–».
    expect(screen.getByTestId('hole-by-hole-outcome-2')).toHaveTextContent('Venter');
    expect(screen.getByTestId('hole-by-hole-card-2')).not.toHaveTextContent(/Vant hullet/);
    expect(screen.getByTestId('hole-by-hole-row-2-a')).toHaveTextContent(/A.*–/);
    expect(screen.getByTestId('hole-by-hole-footer')).toHaveTextContent('«Vel spilt!»');
  });
});

describe('Acey Deucey (#2255 PR 3c)', () => {
  it('ett kort per hull, lavest først: ace med stjerne og +3, deuce med −3 på dempet flate', async () => {
    const bundle = homeBundle({
      game: {
        id: 'ga',
        status: 'finished',
        gameMode: 'acey_deucey',
        modeConfig: { kind: 'acey_deucey', team_size: 1, acey_deucey_scoring: 'net' },
      },
      // Motsatt av stillingen, så motorens rekkefølge inn ikke er den ferdige.
      players: [
        homePlayer({ userId: 'd', name: 'D' }),
        homePlayer({ userId: 'c', name: 'C' }),
        homePlayer({ userId: 'b', name: 'B', courseHandicap: 18 }),
        homePlayer({ userId: 'a', name: 'A' }),
      ],
    });
    // Hull 1: A 3 (ace), B 5 med et slag (netto 4), C 4, D 6 (deuce).
    const adScores = [
      ...holeScores('ga', 'a', 1, 3),
      ...holeScores('ga', 'b', 1, 5),
      ...holeScores('ga', 'c', 1, 4),
      ...holeScores('ga', 'd', 1, 6),
    ];
    await render(<HoleByHoleBody bundle={bundle} scores={adScores} />);

    expect(screen.getByRole('header', { name: 'Hull for hull' })).toBeTruthy();
    expect(screen.getByText('Acey Deucey · Netto')).toBeTruthy();
    expect(screen.getAllByTestId(/^hole-by-hole-card-/)).toHaveLength(18);

    // Hull 1: lavest først, B før C på lik score (stillingen), poengene med fortegn.
    const rows = screen.getAllByTestId(/^hole-by-hole-row-1-/).map((r) => r.props.testID);
    expect(rows).toEqual([
      'hole-by-hole-row-1-a',
      'hole-by-hole-row-1-b',
      'hole-by-hole-row-1-c',
      'hole-by-hole-row-1-d',
    ]);
    expect(screen.getByTestId('hole-by-hole-row-1-a')).toHaveTextContent(/A.*\+3.*3/);
    expect(screen.getByTestId('hole-by-hole-row-1-b')).toHaveTextContent(/B.*0.*brutto 5.*4/);
    expect(screen.getByTestId('hole-by-hole-row-1-d')).toHaveTextContent(/D.*\u22123.*6/);
    // Deuce-raden på webbens `bg-surface-2`.
    expect(screen.getByTestId('hole-by-hole-row-1-d')).toHaveStyle({ backgroundColor: PALETTES.light.surface2 });
    expect(screen.queryByTestId('hole-by-hole-waiting-1')).toBeNull();
    // Stjerna (ace) er dekor for skjermleseren, som på webben (aria-hidden).
    expect(screen.queryByTestId('hole-by-hole-star-1-a')).toBeNull();
    expect(screen.getByTestId('hole-by-hole-star-1-a', HIDDEN)).toHaveTextContent('★');
    expect(screen.queryByTestId('hole-by-hole-star-1-d', HIDDEN)).toBeNull();

    // Hull 2 er ikke spilt: «Venter», ingen poeng, score som «–».
    expect(screen.getByTestId('hole-by-hole-waiting-2')).toHaveTextContent('Venter');
    expect(screen.getByTestId('hole-by-hole-card-2')).not.toHaveTextContent(/\+3|\u2212/);
    expect(screen.getByTestId('hole-by-hole-row-2-a')).toHaveTextContent(/^A–$/);
    expect(screen.getByTestId('hole-by-hole-footer')).toHaveTextContent('«Vel spilt!»');
  });
});
