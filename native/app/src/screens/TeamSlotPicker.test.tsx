// #2840 del 3: «Velg en venn» fra lagsiden (Type C). Delene er lagskjemaets
// (`FriendPicker.tsx`), låst i `TeamSignupForm.test.tsx`. Her låses det velgeren svarer
// for: hvem som er bleke og hvorfor, at «Legg til venn» står, at du velger én, og hva
// knappen sender.
/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock-fabrikkene heises over importene */
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { FriendItem, FriendsLoadResult } from '../data/friends';
import type { TeamPageActionResult } from '../data/teamPage';
import type { ScreenProps } from '../navigation';
import { stackNavigation } from '../test/stackNavigation';
import { TeamSlotPicker } from './TeamSlotPicker';

jest.mock('../supabase', () => require('../test/supabaseMock'));
jest.mock('react-native-safe-area-context', () => require('../test/safeAreaMock').safeAreaMock());
jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (callback: () => void) => {
    require('react').useEffect(callback, [callback]);
  },
}));
jest.mock('../data/friends', () => ({
  fetchFriends: jest.fn(async () => mockFriends),
}));
jest.mock('../data/teamPage', () => ({
  addTeammate: jest.fn(async () => mockAction),
}));

let mockFriends: FriendsLoadResult;
let mockAction: TeamPageActionResult = { ok: true, status: 'added' };
const { addTeammate } = jest.requireMock('../data/teamPage') as { addTeammate: jest.Mock };

const stats = (roundsTogether: number) => ({ roundsTogether, lastPlayedAt: null, lastGameName: null });
const FRIENDS: FriendItem[] = [
  { id: 'ingrid', name: 'Ingrid Næss', hcp: 25.1, stats: stats(1) },
  { id: 'anders', name: 'Anders Moe', hcp: null, stats: stats(0) },
  { id: 'ola', name: 'Ola Kompis', hcp: 18, stats: stats(6) },
  { id: 'eirik', name: 'Eirik Dahl', hcp: null, stats: stats(0) },
];

const SHORT_ID = 'abcd2345';

async function renderPicker(replaceRequestId: string | null = null) {
  const params = {
    shortId: SHORT_ID,
    teamName: 'Birdie-jegerne',
    open: 1,
    replaceRequestId,
    teamUserIds: ['meg', 'ola'],
    unavailableFriendIds: ['ola', 'eirik'],
  };
  const navigation = stackNavigation([{ name: 'Home' }, { name: 'TeamPage', params: { shortId: SHORT_ID } }, { name: 'TeamSlotPicker', params }]);
  const props = { navigation, route: { key: 'pick', name: 'TeamSlotPicker', params } };
  await render(<TeamSlotPicker {...(props as unknown as ScreenProps<'TeamSlotPicker'>)} />);
  return navigation;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockFriends = { ok: true, data: { friends: FRIENDS, incoming: [], outgoing: [], suggestions: [], friendCode: 'kode1' } };
  mockAction = { ok: true, status: 'added' };
});

it('venner på laget og i runden står bleke med grunnen, og «Legg til venn» står', async () => {
  await renderPicker();
  expect(screen.getByTestId('team-slot-title')).toHaveTextContent('Hvem skal med?');
  expect(screen.getByTestId('team-slot-add-friend')).toBeTruthy();
  expect(screen.getByTestId('team-slot-friend-ola')).toHaveProp('accessibilityLabel', 'Ola Kompis, På laget');
  expect(screen.getByTestId('team-slot-friend-ola')).toBeDisabled();
  expect(screen.getByTestId('team-slot-friend-eirik')).toHaveProp('accessibilityLabel', 'Eirik Dahl, Alt påmeldt i runden');
  expect(screen.getByTestId('team-slot-friend-ingrid')).not.toBeDisabled();
  expect(screen.getByTestId('team-slot-submit')).toHaveTextContent('Velg en venn');
});

it('«Legg til venn» står også når søket ikke treffer', async () => {
  await renderPicker();
  await fireEvent.changeText(screen.getByTestId('team-slot-search'), 'Jonas');
  expect(screen.getByTestId('team-slot-no-hit')).toBeTruthy();
  expect(screen.getByTestId('team-slot-add-friend')).toBeTruthy();
  await fireEvent.press(screen.getByTestId('team-slot-add-friend'));
  expect(screen.getByTestId('team-sheet')).toBeTruthy();
});

it('du velger én venn: ring og hake, og knappen sier hvem', async () => {
  await renderPicker();
  await fireEvent.press(screen.getByTestId('team-slot-friend-ingrid'));
  expect(screen.getByTestId('team-slot-friend-ingrid-disc-check')).toBeTruthy();
  await fireEvent.press(screen.getByTestId('team-slot-friend-anders'));
  expect(screen.queryByTestId('team-slot-friend-ingrid-disc-check')).toBeNull();
  expect(screen.getByTestId('team-slot-submit')).toHaveTextContent('Legg Anders til på laget');
});

it.each([
  ['«Velg en venn» fyller en ledig plass', null],
  ['«Bytt med en venn» sender raden som byttes ut', 'r-per'],
])('%s, og går tilbake til lagsiden', async (_label, replaceRequestId) => {
  const navigation = await renderPicker(replaceRequestId);
  await fireEvent.press(screen.getByTestId('team-slot-friend-ingrid'));
  await fireEvent.press(screen.getByTestId('team-slot-submit'));
  expect(addTeammate).toHaveBeenCalledWith(SHORT_ID, 'ingrid', replaceRequestId);
  expect(navigation.popTo).toHaveBeenCalledWith('TeamPage', { shortId: SHORT_ID });
});

it('et fullt lag står over knappen, og velgeren blir stående', async () => {
  mockAction = { ok: false, reason: 'team_full' };
  const navigation = await renderPicker();
  await fireEvent.press(screen.getByTestId('team-slot-friend-ingrid'));
  await fireEvent.press(screen.getByTestId('team-slot-submit'));
  expect(screen.getByTestId('team-slot-error')).toHaveTextContent('Laget er fullt.');
  expect(navigation.popTo).not.toHaveBeenCalled();
});
