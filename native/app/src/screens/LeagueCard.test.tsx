// #2815: kortet bak et resultat i sesongtabellen (Type C, én render-test).
//
// Porten og tallene er serverens (`leagueCardAccess` og `computeFlightCard`,
// låst i webbens tester); her låses det skjermen svarer for: en feil viser
// «Prøv igjen», og kortet fra ruta vises med navnet, runden, resultatlinja og
// netto per hull i slagspill.
/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock-factories heises over importene og må bruke require */
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { buildScorecardGrid, stablefordPointsFnFor } from '../../../../lib/scorecard/scorecardGrid';
import type { LeagueCardResponse } from '../../../../lib/league/appLeagueView';
import type { LeagueCardResult } from '../data/leagueCard';
import { fetchLeagueCard } from '../data/leagueCard';
import type { ScreenProps } from '../navigation';
import { LeagueCard } from './LeagueCard';

jest.mock('../supabase', () => require('../test/supabaseMock'));
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('../data/leagueCard', () => ({
  fetchLeagueCard: jest.fn(async () => mockResults.shift()),
}));

const CARD: LeagueCardResponse = {
  leagueId: 'liga-vinter',
  leagueName: 'Vinterliga',
  roundLabel: 'Runde 1',
  gameId: 'g1',
  player: { userId: 'anders', name: 'Anders Berg' },
  format: 'stroke',
  axis: 'net',
  playingHandicap: 2,
  value: 1,
  grid: buildScorecardGrid({
    rows: [
      { holeNumber: 1, par: 4, strokes: 5, extra: 1 },
      { holeNumber: 2, par: 4, strokes: 5, extra: 1 },
      { holeNumber: 3, par: 3, strokes: 4, extra: 0 },
    ],
    pointsFn: null,
  }),
};

// Navnet må starte med `mock`: jest.mock-factoryen heises over importene.
let mockResults: LeagueCardResult[] = [];

it('en feil gir «Prøv igjen»; kortet viser navnet, runden, resultatet og netto per hull', async () => {
  mockResults = [{ ok: false, reason: 'load_failed' }, { ok: true, card: CARD }];
  const setOptions = jest.fn();
  const props = {
    navigation: { setOptions },
    route: { key: 'card', name: 'LeagueCard', params: { leagueId: 'liga-vinter', gameId: 'g1', userId: 'anders' } },
  };
  await render(<LeagueCard {...(props as unknown as ScreenProps<'LeagueCard'>)} />);

  await waitFor(() => expect(screen.getByTestId('league-card-error')).toBeTruthy());
  await fireEvent.press(screen.getByText('Prøv igjen'));

  await waitFor(() => expect(screen.getByTestId('league-card-screen')).toBeTruthy());
  expect(fetchLeagueCard).toHaveBeenCalledWith('liga-vinter', 'g1', 'anders');
  expect(screen.getByText('Kortet til Anders Berg')).toBeTruthy();
  expect(screen.getByText('Runde 1 i Vinterliga')).toBeTruthy();
  expect(screen.getByTestId('league-card-result')).toHaveTextContent('Resultat: +1 · Spillehandicap 2');
  expect(screen.getByTestId('total-netto')).toHaveTextContent('12');
  expect(screen.queryByTestId('total-poeng')).toBeNull();
  expect(setOptions).toHaveBeenCalled();
});

// #2829: NETTO under kortet følger regelen for spillerens eget kort
// (`showsNetTotal`): også i stableford, men ikke på et kort regnet uten handicap.
describe('#2829: NETTO i summene', () => {
  const STABLEFORD: LeagueCardResponse = {
    ...CARD,
    format: 'stableford',
    value: 7,
    grid: buildScorecardGrid({
      rows: CARD.grid.halves.flatMap((half) =>
        half.cells.map((cell) => ({ holeNumber: cell.holeNumber, par: cell.par, strokes: cell.strokes, extra: 1 })),
      ),
      pointsFn: stablefordPointsFnFor('stableford'),
    }),
  };

  async function renderCard(card: LeagueCardResponse) {
    mockResults = [{ ok: true, card }];
    const props = {
      navigation: { setOptions: jest.fn() },
      route: { key: 'card', name: 'LeagueCard', params: { leagueId: 'liga-vinter', gameId: 'g1', userId: 'anders' } },
    };
    await render(<LeagueCard {...(props as unknown as ScreenProps<'LeagueCard'>)} />);
    await waitFor(() => expect(screen.getByTestId('league-card-screen')).toBeTruthy());
  }

  it('et stableford-kort på netto-aksen har BRUTTO, NETTO og POENG, som spillerens eget kort', async () => {
    await renderCard(STABLEFORD);
    expect(screen.getByTestId('total-brutto')).toHaveTextContent('14');
    expect(screen.getByTestId('total-netto')).toHaveTextContent('11');
    expect(screen.getByTestId('total-poeng')).toBeTruthy();
  });

  it('et kort i en brutto-liga er regnet uten handicap: ingen NETTO', async () => {
    await renderCard({ ...STABLEFORD, axis: 'gross', playingHandicap: null });
    expect(screen.getByTestId('total-brutto')).toHaveTextContent('14');
    expect(screen.queryByTestId('total-netto')).toBeNull();
    expect(screen.getByTestId('total-poeng')).toBeTruthy();
  });
});
