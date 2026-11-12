// #2840: lagskjemaet (Type C). Reglene for plassene, navnet og tekstene har sine egne
// Type A-tester (`teamLineup.test.ts`, `teamSignupCopy.test.ts`). Her låses det
// skjemaet svarer for: hvilke tilstander tegningen v3.1 har, hva et trykk gjør, at
// «Legg til venn» alltid står, og hva sendingen sender og gjør med svaret.
/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock-fabrikkene heises over importene */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { impactAsync } from 'expo-haptics';
import { AccessibilityInfo, Share } from 'react-native';
import type { AppTeamSignupForm } from '../../../../../lib/games/appRoundInviteView';
import type { FriendItem, FriendsLoadResult } from '../../data/friends';
import type { TeamSignupResult } from '../../data/roundInvite';
import { ROUND_INVITE_TEXT } from '../../lib/roundInviteCopy';
import { TEAM_SIGNUP_TEXT, noHitLine, pickMoreLabel, submitTeamLabel } from '../../lib/teamSignupCopy';
import { TeamSignupForm } from './TeamSignupForm';

jest.mock('react-native-safe-area-context', () => require('../../test/safeAreaMock').safeAreaMock());
jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (callback: () => void) => {
    mockFocus = callback;
    require('react').useEffect(callback, [callback]);
  },
}));
jest.mock('../../session', () => ({
  useSession: () => ({ userId: 'me', email: 'martin@example.com' }),
}));
jest.mock('../../data/profile', () => ({
  fetchOwnProfile: jest.fn(async () => ({ name: 'Martin Berg' })),
}));
jest.mock('../../data/friends', () => ({
  fetchFriends: jest.fn(async () => mockFriends),
}));
jest.mock('../../data/roundInvite', () => ({
  registerTeam: jest.fn(async () => mockRegister),
}));

let mockFocus: () => void = () => {};
let mockFriends: FriendsLoadResult;
let mockRegister: TeamSignupResult;

const { fetchFriends } = jest.requireMock('../../data/friends') as { fetchFriends: jest.Mock };
const { registerTeam } = jest.requireMock('../../data/roundInvite') as { registerTeam: jest.Mock };

const stats = (roundsTogether: number) => ({ roundsTogether, lastPlayedAt: null, lastGameName: null });
const FRIENDS: FriendItem[] = [
  { id: 'ola', name: 'Ola Kompis', hcp: 18, stats: stats(6) },
  { id: 'kari', name: 'Kari Nord', hcp: 12.4, stats: stats(4) },
  { id: 'per', name: 'Per Hansen', hcp: 9.8, stats: stats(3) },
  { id: 'ingrid', name: 'Ingrid Næss', hcp: 25.1, stats: stats(1) },
  { id: 'eirik', name: 'Eirik Dahl', hcp: null, stats: stats(0) },
  { id: 'anders', name: 'Anders Moe', hcp: null, stats: stats(0) },
];

const FORM: AppTeamSignupForm = {
  kind: 'form',
  teamSize: 4,
  nameMin: 3,
  nameMax: 40,
  suggestedName: 'Martins lag',
  unavailableFriendIds: ['eirik'],
};

const VIEW = {
  round: {
    name: 'Onsdagsgolfen',
    modeLabel: 'Texas scramble',
    courseName: 'Byneset',
    teeName: null,
    teeOffAt: '2026-11-19T17:30:00.000Z',
    entryFeeKr: 0,
  },
  seats: { kind: 'capped' as const, cap: 12, held: 8 },
};

const onRegistered = jest.fn();
const onStale = jest.fn();

function friendsOk(friends: FriendItem[] = FRIENDS, friendCode: string | null = 'abc123'): FriendsLoadResult {
  return { ok: true, data: { friends, incoming: [], outgoing: [], suggestions: [], friendCode } };
}

async function renderForm(form: AppTeamSignupForm = FORM) {
  await render(
    <TeamSignupForm shortId="k3x9pq" view={VIEW} form={form} onRegistered={onRegistered} onStale={onStale} />,
  );
  await screen.findByTestId(mockFriends.ok && mockFriends.data.friends.length === 0 ? 'team-form-no-friends' : 'team-form-friends');
}

const submit = () => screen.getByTestId('team-form-submit');

async function pick(...ids: string[]) {
  for (const id of ids) await fireEvent.press(screen.getByTestId(`team-form-friend-${id}`));
}

beforeEach(() => {
  jest.clearAllMocks();
  mockFriends = friendsOk();
  mockRegister = {
    ok: true,
    status: 'team_registered',
    captainRequestId: 'r1',
    joinEffect: 'approval',
    slotResults: [
      { ok: true, userId: 'ola', name: 'Ola Kompis' },
      { ok: true, userId: 'kari', name: 'Kari Nord' },
      { ok: false, userId: 'per', name: 'Per Hansen', reason: 'alreadyRegistered' },
    ],
  };
  // Uten glid i de fleste testene: skiva står i laget med en gang.
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
  process.env.EXPO_PUBLIC_WEB_BASE_URL = 'https://tornygolf.no';
});

afterAll(() => {
  delete process.env.EXPO_PUBLIC_WEB_BASE_URL;
});

describe('start', () => {
  it('lagnavnet, du med kapteinsmerket, tre ledige plasser, og en knapp som teller', async () => {
    await renderForm();
    expect(screen.getByTestId('team-form-name')).toHaveTextContent('Martins lag');
    expect(screen.getByTestId('team-form-meta')).toHaveTextContent('Onsdagsgolfen · tor 19. nov · 8 av 12 plasser');
    expect(screen.getByTestId('team-form-self')).toHaveTextContent(`MB${TEAM_SIGNUP_TEXT.captainBadge}${TEAM_SIGNUP_TEXT.you}`);
    for (const i of [0, 1, 2]) expect(screen.getByTestId(`team-form-slot-${i}`)).toHaveTextContent(`+${TEAM_SIGNUP_TEXT.free}`);
    expect(submit()).toHaveTextContent(pickMoreLabel(3));
    expect(submit()).toBeDisabled();
    expect(screen.getByTestId('team-form-add-friend')).toBeTruthy();
  });

  it('en venn som alt er i runden, er blek og kan ikke velges', async () => {
    await renderForm();
    const eirik = screen.getByTestId('team-form-friend-eirik');
    expect(eirik).toHaveTextContent(TEAM_SIGNUP_TEXT.unavailable, { exact: false });
    expect(eirik).toBeDisabled();
    await fireEvent.press(eirik);
    expect(screen.getByTestId('team-form-slot-0')).toHaveTextContent(`+${TEAM_SIGNUP_TEXT.free}`);
  });
});

describe('å velge', () => {
  it('en venn fyller første ledige plass, får haken, og knappen teller ned', async () => {
    await renderForm();
    await pick('ola');
    expect(screen.getByTestId('team-form-slot-0')).toHaveTextContent('OKOla');
    expect(screen.getByTestId('team-form-friend-ola-disc-check')).toBeTruthy();
    expect(submit()).toHaveTextContent(pickMoreLabel(2));
    await waitFor(() => expect(impactAsync).toHaveBeenCalledTimes(1));
  });

  it('et trykk på vennen i laget tar vennen ut, og plassen blir ledig', async () => {
    await renderForm();
    await pick('ola', 'kari');
    await fireEvent.press(screen.getByTestId('team-form-slot-0'));
    expect(screen.getByTestId('team-form-slot-0')).toHaveTextContent(`+${TEAM_SIGNUP_TEXT.free}`);
    expect(screen.getByTestId('team-form-slot-1')).toHaveTextContent('KNKari');
    expect(screen.queryByTestId('team-form-friend-ola-disc-check')).toBeNull();
  });

  it('fullt lag: resten blir bleke, «Legg til venn» står, og knappen er «Meld på»', async () => {
    await renderForm();
    await pick('ola', 'kari', 'per');
    expect(screen.getByTestId('team-form-friend-ingrid')).toBeDisabled();
    expect(screen.getByTestId('team-form-friend-ola')).not.toBeDisabled();
    expect(screen.getByTestId('team-form-add-friend')).not.toBeDisabled();
    expect(submit()).toHaveTextContent(submitTeamLabel('Martins lag'));
    expect(submit()).not.toBeDisabled();
  });

  // Jest kan ikke måle skivene, så glidet faller tilbake til å lande med en gang. Det
  // som låses, er at dunket kommer også da, og at vennen står i laget.
  it('med bevegelse på lander vennen og dunket kommer', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
    await renderForm();
    await pick('kari');
    expect(screen.getByTestId('team-form-slot-0')).toHaveTextContent('KNKari');
    await waitFor(() => expect(impactAsync).toHaveBeenCalledTimes(1));
  });
});

describe('søket', () => {
  it('filtrerer på navn', async () => {
    await renderForm();
    await fireEvent.changeText(screen.getByTestId('team-form-search'), 'kari');
    expect(screen.getByTestId('team-form-friend-kari')).toBeTruthy();
    expect(screen.queryByTestId('team-form-friend-ola')).toBeNull();
  });

  it('uten treff står setningen, og «Legg til venn» står fortsatt', async () => {
    await renderForm();
    await fireEvent.changeText(screen.getByTestId('team-form-search'), 'Jonas');
    expect(screen.getByTestId('team-form-no-hit')).toHaveTextContent(noHitLine('Jonas'));
    expect(screen.getByTestId('team-form-add-friend')).toBeTruthy();
  });
});

describe('uten venner', () => {
  it('står setningen og en hel «Legg til en venn», og ikke noe søk', async () => {
    mockFriends = friendsOk([]);
    await renderForm();
    expect(screen.getByTestId('team-form-no-friends')).toHaveTextContent(TEAM_SIGNUP_TEXT.noFriends);
    expect(screen.queryByTestId('team-form-search')).toBeNull();
    await fireEvent.press(screen.getByTestId('team-form-add-first-friend'));
    expect(screen.getByTestId('team-sheet')).toBeTruthy();
    expect(submit()).toHaveTextContent(pickMoreLabel(3));
  });
});

describe('arket «Legg til en venn»', () => {
  it('viser koden, deler lenka di, og henter vennene på nytt når det lukkes', async () => {
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' });
    await renderForm();
    await fireEvent.press(screen.getByTestId('team-form-add-friend'));
    expect(screen.getByTestId('team-sheet')).toHaveTextContent(TEAM_SIGNUP_TEXT.sheetBody, { exact: false });
    expect(screen.getByTestId('team-sheet-qr')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('team-sheet-share'));
    expect(share).toHaveBeenCalledWith({ message: 'https://tornygolf.no/venner/legg-til/abc123' });
    const calls = fetchFriends.mock.calls.length;
    await fireEvent.press(screen.getByTestId('team-sheet-close'));
    expect(screen.queryByTestId('team-sheet')).toBeNull();
    expect(fetchFriends.mock.calls.length).toBe(calls + 1);
  });

  // Seks rader står; den sjuende ligger bak «Vis alle 7» (`pickerRows`).
  it('en ny venn dukker opp når skjermen får fokus igjen', async () => {
    await renderForm();
    mockFriends = friendsOk([...FRIENDS, { id: 'jonas', name: 'Jonas Li', hcp: null, stats: stats(0) }]);
    await act(async () => mockFocus());
    expect(await screen.findByTestId('team-form-show-all')).toHaveTextContent('Vis alle 7');
    await fireEvent.press(screen.getByTestId('team-form-show-all'));
    expect(screen.getByTestId('team-form-friend-jonas')).toBeTruthy();
  });
});

describe('lagnavnet', () => {
  it('for kort: feilen står, og «Ferdig» gjør ingenting; et godt navn blir overskriften', async () => {
    await renderForm();
    await fireEvent.press(screen.getByTestId('team-form-name'));
    await fireEvent.changeText(screen.getByTestId('team-form-name-input'), 'Bi');
    expect(screen.getByTestId('team-form-name-count')).toHaveTextContent('2/40');
    expect(screen.getByTestId('team-form-name-error')).toHaveTextContent('Lagnavnet må ha minst 3 tegn.');
    await fireEvent.press(screen.getByTestId('team-form-name-done'));
    expect(screen.getByTestId('team-form-name-input')).toBeTruthy();

    await fireEvent.changeText(screen.getByTestId('team-form-name-input'), 'Birdie-jegerne');
    await fireEvent.press(screen.getByTestId('team-form-name-done'));
    expect(screen.getByTestId('team-form-name')).toHaveTextContent('Birdie-jegerne');
  });
});

describe('å sende', () => {
  it('sender navnet og vennene fra venstre, og gir svaret per venn videre', async () => {
    await renderForm();
    await pick('ola', 'kari', 'per');
    await fireEvent.press(submit());
    expect(registerTeam).toHaveBeenCalledWith('k3x9pq', 'Martins lag', ['ola', 'kari', 'per']);
    expect(onRegistered).toHaveBeenCalledWith('approval', {
      teamName: 'Martins lag',
      rows: [
        { userId: 'ola', name: 'Ola Kompis', result: { ok: true, userId: 'ola', name: 'Ola Kompis' } },
        { userId: 'kari', name: 'Kari Nord', result: { ok: true, userId: 'kari', name: 'Kari Nord' } },
        {
          userId: 'per',
          name: 'Per Hansen',
          result: { ok: false, userId: 'per', name: 'Per Hansen', reason: 'alreadyRegistered' },
        },
      ],
    });
  });

  it('en som ikke er venn: teksten står over knappen', async () => {
    mockRegister = { ok: false, reason: 'teammate_not_friend' };
    await renderForm();
    await pick('ola', 'kari', 'per');
    await fireEvent.press(submit());
    expect(screen.getByTestId('team-form-error')).toHaveTextContent(TEAM_SIGNUP_TEXT.teammateNotFriend);
    expect(onRegistered).not.toHaveBeenCalled();
  });

  it('uten nett sier knappen «Prøv igjen»', async () => {
    mockRegister = { ok: false, reason: 'network' };
    await renderForm();
    await pick('ola', 'kari', 'per');
    await fireEvent.press(submit());
    expect(submit()).toHaveTextContent(ROUND_INVITE_TEXT.retry);
  });

  it('#2840: game_full sier at laget ikke får plass, også når skjemaet står etter ny henting', async () => {
    mockRegister = { ok: false, reason: 'game_full' };
    await renderForm();
    await pick('ola', 'kari', 'per');
    await fireEvent.press(submit());
    expect(screen.getByTestId('team-form-error')).toBeTruthy();
    expect(onStale).toHaveBeenCalledWith(true);
  });

  it.each([
    ['game_full', true],
    ['signup_closed', false],
  ] as const)('%s: skjermen spør på nytt', async (reason, afterFull) => {
    mockRegister = { ok: false, reason };
    await renderForm();
    await pick('ola', 'kari', 'per');
    await fireEvent.press(submit());
    expect(onStale).toHaveBeenCalledWith(afterFull);
  });
});
