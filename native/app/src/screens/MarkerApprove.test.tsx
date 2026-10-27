// #2661: markørens skjerm i appen (Type C, én render-test).
//
// Porten og kortet er serverens (`markerReviewAccess`, låst i webbens tester);
// her låses det skjermen svarer for: kortet hentes fra ruta og vises med
// navnet og runden, «Godkjenn» går til scorekort-ruta, og etterpå står det
// serveren sier om kortet. Varselet om kortet er lest når skjermen er åpnet.
/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock-factories heises over importene og må bruke require */
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { MarkerCardResponse } from '../../../../lib/league/appLeagueView';
import type { ScreenProps } from '../navigation';
import { useMarkVisitRead } from '../lib/useMarkVisitRead';
import { approveScorecard } from '../data/playerActions';
import { MarkerApprove } from './MarkerApprove';

jest.mock('../supabase', () => require('../test/supabaseMock'));
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('../lib/useMarkVisitRead');
jest.mock('../data/marker', () => ({
  fetchMarkerCard: jest.fn(async () => ({ ok: true, card: mockCards.shift() ?? mockLast })),
}));
jest.mock('../data/playerActions', () => ({
  approveScorecard: jest.fn(async () => ({ ok: true, alreadyDone: false })),
  rejectScorecard: jest.fn(async () => ({ ok: true, alreadyDone: false })),
}));

const card = (state: MarkerCardResponse['state']): MarkerCardResponse => ({
  leagueId: 'liga-vinter',
  leagueName: 'Vinterliga',
  roundLabel: 'Runde 3',
  gameId: 'g1',
  player: { userId: 'anders', name: 'Anders Berg' },
  role: 'marker',
  markerName: 'Mia',
  state,
  holes: [
    { number: 1, par: 4, strokeIndex: 1, strokes: 5 },
    { number: 2, par: 3, strokeIndex: 2, strokes: 3 },
  ],
});

// Navnene må starte med `mock`: jest.mock-factoryene heises over importene.
let mockCards: MarkerCardResponse[] = [];
let mockLast: MarkerCardResponse = card('pending');

it('viser kortet, godkjenner gjennom scorekort-ruta og viser hvor kortet står etterpå', async () => {
  mockCards = [card('pending'), card('approved')];
  mockLast = card('approved');
  const props = {
    navigation: { setOptions: jest.fn() },
    route: {
      key: 'marker',
      name: 'MarkerApprove',
      params: { leagueId: 'liga-vinter', gameId: 'g1', userId: 'anders' },
    },
  };
  await render(<MarkerApprove {...(props as unknown as ScreenProps<'MarkerApprove'>)} />);

  await waitFor(() => expect(screen.getByTestId('marker-screen')).toBeTruthy());
  expect(screen.getByText('Kortet til Anders Berg')).toBeTruthy();
  expect(screen.getByText('Runde 3 i Vinterliga')).toBeTruthy();
  expect(useMarkVisitRead).toHaveBeenCalledWith('leagueMarker', 'g1');

  await fireEvent.press(screen.getByTestId('marker-approve'));
  expect(approveScorecard).toHaveBeenCalledWith('g1', 'anders');
  await waitFor(() => expect(screen.getByTestId('marker-state-approved')).toBeTruthy());
  expect(screen.queryByTestId('marker-approve')).toBeNull();
});
