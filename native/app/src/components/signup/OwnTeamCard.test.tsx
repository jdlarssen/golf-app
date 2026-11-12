// #2840 del 4: «Meld på laget ditt» på runden (Type C). Kortet står bare når du ikke har
// et lag, ser etter laget uten å merke varsler lest, og et trykk går videre.
/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock-fabrikkene heises over importene */
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { TeamPageLoadResult } from '../../data/teamPage';
import { OwnTeamCard } from './OwnTeamCard';

jest.mock('../../supabase', () => require('../../test/supabaseMock'));
jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (callback: () => void) => {
    require('react').useEffect(callback, [callback]);
  },
}));
jest.mock('../../data/teamPage', () => ({
  fetchTeamPage: jest.fn(async () => mockLoad),
}));

let mockLoad: TeamPageLoadResult;

const GAME = {
  id: 'g1',
  shortId: 'abcd2345',
  name: 'Onsdagsgolfen',
  courseName: null,
  joinEffect: 'instant' as const,
  signupsClosed: false,
  teamSize: 4,
  teeOffAt: null,
};

it('uten lag: tittelen, linja og knappen, som på tegningen', async () => {
  mockLoad = { ok: true, view: { kind: 'no_team', game: GAME } };
  const onOpen = jest.fn();
  await render(<OwnTeamCard shortId="abcd2345" onOpen={onOpen} />);
  expect(screen.getAllByText('Meld på laget ditt')).toHaveLength(2);
  expect(screen.getByText('Du står ikke på lista ennå. Meld på laget ditt, så blir du kaptein.')).toBeTruthy();
  await fireEvent.press(screen.getByTestId('own-team-open'));
  expect(onOpen).toHaveBeenCalledTimes(1);
  expect(require('../../data/teamPage').fetchTeamPage).toHaveBeenCalledWith('abcd2345', { visit: false });
});

it.each([
  [
    'med et lag (raden til lagsiden står i stedet)',
    {
      ok: true,
      view: {
        kind: 'captain',
        game: GAME,
        myRowId: 'r1',
        myStatus: 'pending',
        teamName: 'Birdie-jegerne',
        captain: null,
        members: [],
      },
    },
  ],
  ['uten nett', { ok: false, reason: 'offline' }],
] as const)('%s står ikke kortet', async (_label, load) => {
  mockLoad = load as TeamPageLoadResult;
  await render(<OwnTeamCard shortId="abcd2345" onOpen={jest.fn()} />);
  expect(screen.queryByTestId('own-team-card')).toBeNull();
});
