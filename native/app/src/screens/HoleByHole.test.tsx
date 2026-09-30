// #2255 PR 3a: den ene render-testen (Type C) for «Hull for hull» i appen.
//
// Hva radene, deltotalene og hullvinneren ER, låses i `soloScorecard.test.ts`
// (webbens og appens felles modell). Her låses koblingen: overskriften, at
// stillingen og begge niene kommer på skjermen, at stjerna er dekor, og at en
// blind runde som pågår holder alt tilbake.
/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock-factories heises over importene og må bruke require */
import type { ReactElement } from 'react';
import { render, screen, waitFor } from '@testing-library/react-native';
import type { GameBundle } from '../data/gameBundle';
import type { ScreenProps } from '../navigation';
import { holeScores, homeBundle, homePlayer } from '../test/homeFixtures';
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

  it('toppen får spillnavnet som kicker, som på webben', async () => {
    mockNavigation.setOptions.mockClear();
    mockScreen.bundle = finished();
    mockScreen.scores = scores;
    mockScreen.seed = async () => 0;
    await render(<HoleByHole {...props} />);
    await waitFor(() => expect(mockNavigation.setOptions).toHaveBeenCalled());
    const options = mockNavigation.setOptions.mock.lastCall![0] as {
      title: string;
      headerTitle: () => ReactElement;
      headerShadowVisible: boolean;
    };
    expect(options.title).toBe('Hull for hull');
    expect(options.headerShadowVisible).toBe(false);
    await render(options.headerTitle());
    expect(screen.getByTestId('kicker-title')).toHaveTextContent(finished().game.name);
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
    expect(screen.getByTestId('hole-by-hole-footer')).toHaveTextContent('Vel spilt!');
  });
});

