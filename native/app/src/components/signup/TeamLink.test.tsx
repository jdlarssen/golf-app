// #2840 del 3: raden til lagsiden (Type C). Linja og skivene er Type A
// (`teamPageCopy.test.ts`, `teamPageModel.test.ts`). Her låses at raden bare står med et
// lag, og at et trykk åpner lagsiden.
/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock-fabrikkene heises over importene */
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { AppTeamPageResponse } from '../../../../../lib/games/appRoundInviteView';
import type { TeamPageLoadResult } from '../../data/teamPage';
import { TeamLink } from './TeamLink';

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
const TEAM: AppTeamPageResponse = {
  kind: 'captain',
  game: GAME,
  myRowId: 'r-meg',
  myStatus: 'approved',
  teamName: 'Birdie-jegerne',
  captain: { requestId: 'r-meg', userId: 'u-meg', displayName: 'Martin Berg', status: 'approved' },
  members: [
    { requestId: 'r-ola', userId: 'u-ola', displayName: 'Ola Kompis', status: 'approved', isGuest: false },
    { requestId: 'r-kari', userId: 'u-kari', displayName: 'Kari Nord', status: 'pending', isGuest: false },
    { requestId: 'r-per', userId: 'u-per', displayName: 'Per Hansen', status: 'rejected', isGuest: false },
  ],
};

it('med et lag: lagnavnet og linja, og et trykk åpner lagsiden', async () => {
  mockLoad = { ok: true, view: TEAM };
  const onOpen = jest.fn();
  await render(<TeamLink shortId="abcd2345" onOpen={onOpen} />);
  expect(screen.getByTestId('team-link-title')).toHaveTextContent('Birdie-jegerne');
  expect(screen.getByTestId('team-link-line')).toHaveTextContent('Laget ditt · 2 av 3 har svart ja');
  await fireEvent.press(screen.getByTestId('team-link'));
  expect(onOpen).toHaveBeenCalledTimes(1);
  // #2840: raden er en titt. Varslene merkes lest først når lagsiden åpnes.
  expect(require('../../data/teamPage').fetchTeamPage).toHaveBeenCalledWith('abcd2345', { visit: false });
});

it.each([
  ['uten lag', { ok: true, view: { kind: 'no_team', game: GAME } }],
  ['uten nett', { ok: false, reason: 'offline' }],
] as const)('%s står ingen rad', async (_label, load) => {
  mockLoad = load as TeamPageLoadResult;
  await render(<TeamLink shortId="abcd2345" onOpen={jest.fn()} />);
  expect(screen.queryByTestId('team-link')).toBeNull();
});
