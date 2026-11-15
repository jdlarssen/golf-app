// native/app/src/screens/FriendPage.test.tsx
// #2381: vennesiden (Type C), tegning C «Dere to».
//
// Tekstene er `friendsCopy.test.ts` sine, og stien og svaret er
// `data/friends.test.ts` sine. Her låses det bare en render kan bekrefte:
// hvilken tilstand siden står i for hvert forhold og hvert svar (tilstand
// 1–20 i kontrakten), at rundene aldri vises for en som ikke er venn, at et
// trykk på en runde åpner resultatet, og at «Fjern venn» spør først og bare
// går tilbake når siden fortsatt har fokus.
/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock-fabrikkene heises over importene og må bruke require */
import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import { Alert, type AlertButton } from 'react-native';
import {
  fetchFriendRounds,
  fetchFriends,
  removeFriend,
  respondToFriendRequest,
  sendFriendRequest,
  type FriendRecord,
  type FriendRound,
  type FriendsData,
  type FriendStats,
} from '../data/friends';
import type { RootStackParamList, ScreenProps } from '../navigation';
import { FriendPage } from './FriendPage';

jest.mock('../supabase', () => require('../test/supabaseMock'));
jest.mock('react-native-safe-area-context', () => require('../test/safeAreaMock').safeAreaMock());
jest.mock('../data/friends', () => ({
  fetchFriends: jest.fn(),
  fetchFriendRounds: jest.fn(),
  sendFriendRequest: jest.fn(),
  respondToFriendRequest: jest.fn(),
  removeFriend: jest.fn(),
}));

const friendsMock = fetchFriends as jest.Mock;
const roundsMock = fetchFriendRounds as jest.Mock;
const sendMock = sendFriendRequest as jest.Mock;
const respondMock = respondToFriendRequest as jest.Mock;
const removeMock = removeFriend as jest.Mock;

const KH = 'kristian';
const STATS: FriendStats = { roundsTogether: 2, lastPlayedAt: '2026-09-03T15:00:00Z', lastGameName: 'Onsdagsgolfen' };
const ZERO: FriendStats = { roundsTogether: 0, lastPlayedAt: null, lastGameName: null };
const EMPTY: FriendsData = { friends: [], incoming: [], outgoing: [], suggestions: [], friendCode: null };

function round(i: number, badge: FriendRound['badge'], over: Partial<FriendRound> = {}): FriendRound {
  return { gameId: `g${i}`, name: `Runde ${i}`, playedAt: `2026-10-${String(20 - i).padStart(2, '0')}T10:00:00Z`, modeLabel: 'Slagspill', badge, ...over };
}
const record = (youAhead: number, themAhead: number, tied = 0): FriendRecord => ({
  played: youAhead + themAhead + tied,
  youAhead,
  themAhead,
  tied,
});
/** Tegning 1: sju runder, 3–2 mot hverandre, én på lag og én i en ligaflight. */
const SEVEN = [
  round(1, 'you_ahead'),
  round(2, 'them_ahead'),
  round(3, 'same_team', { modeLabel: 'Texas scramble' }),
  round(4, 'you_ahead'),
  round(5, 'you_ahead'),
  round(6, 'them_ahead'),
  round(7, null),
];

const friendsAre = (data: Partial<FriendsData>) => friendsMock.mockResolvedValue({ ok: true, data: { ...EMPTY, ...data } });
const asFriend = (hcp: number | null = 12.4) =>
  friendsAre({ friends: [{ id: KH, name: 'Kristian Holm', hcp, stats: STATS }] });
const roundsAre = (rounds: FriendRound[], rec: FriendRecord) => roundsMock.mockResolvedValue({ ok: true, rounds, record: rec });
const notFriends = () => roundsMock.mockResolvedValue({ ok: false, reason: 'not_friends' });

async function renderPage(params: Partial<RootStackParamList['FriendPage']> = {}, { focused = true } = {}) {
  const navigation = {
    navigate: jest.fn(),
    popTo: jest.fn(),
    goBack: jest.fn(),
    isFocused: jest.fn(() => focused),
    getState: () => ({ index: 1, routes: [{ name: 'Friends' }, { name: 'FriendPage', params: { userId: KH } }] }),
  };
  const props = {
    navigation,
    route: {
      key: 'friend-page',
      name: 'FriendPage',
      params: { userId: KH, name: 'Kristian Holm', hcp: 12.4, from: 'friends', selfInitials: 'SA', ...params },
    },
  };
  await render(<FriendPage {...(props as unknown as ScreenProps<'FriendPage'>)} />);
  return { navigation };
}

/** Streken er pynt for skjermleseren (stillingen har eget navn), så den er skjult. */
const HIDDEN = { includeHiddenElements: true };
const label = (id: string) => screen.getByTestId(id).props.accessibilityLabel as string;

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('en venn', () => {
  it('1: stillingen, streken, lederlinja og de fire siste rundene, og «Vis alle» folder ut resten', async () => {
    asFriend();
    roundsAre(SEVEN, record(3, 2));
    const { navigation } = await renderPage({ relation: 'friend' });

    expect(await screen.findByTestId('friend-page-h2h')).toBeTruthy();
    expect(screen.getByRole('header', { name: 'Kristian Holm' })).toBeTruthy();
    expect(screen.getByTestId('friend-page-subline')).toHaveTextContent('Dere er venner · handicap 12,4');
    expect(label('friend-page-score')).toBe('Du 3, Kristian 2');
    expect(screen.getByTestId('friend-page-leader')).toHaveTextContent('Du leder etter 5 runder mot hverandre.');
    expect(screen.getByTestId('friend-page-bar-you', HIDDEN).props.style).toEqual(expect.arrayContaining([expect.objectContaining({ flex: 3 })]));
    expect(screen.getByTestId('friend-page-bar-them', HIDDEN).props.style).toEqual(expect.arrayContaining([expect.objectContaining({ flex: 2 })]));
    expect(screen.queryByTestId('friend-page-bar-tied', HIDDEN)).toBeNull();

    expect(screen.getByTestId('friend-page-rounds-title')).toHaveTextContent('Runder sammen · 7');
    expect(screen.getByTestId('friend-page-round-g4')).toBeTruthy();
    expect(screen.queryByTestId('friend-page-round-g5')).toBeNull();
    expect(within(screen.getByTestId('friend-page-round-g1')).getByText('Du foran')).toBeTruthy();
    expect(within(screen.getByTestId('friend-page-round-g2')).getByText('Kristian foran')).toBeTruthy();
    expect(within(screen.getByTestId('friend-page-round-g3')).getByText('På lag')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('friend-page-show-all'));
    expect(screen.getByTestId('friend-page-round-g7')).toBeTruthy();
    expect(screen.queryByTestId('friend-page-show-all')).toBeNull();

    // 12: et trykk på en runde åpner resultatet for spillet.
    await fireEvent.press(screen.getByTestId('friend-page-round-g2'));
    expect(navigation.navigate).toHaveBeenCalledWith('Leaderboard', { gameId: 'g2' });
    expect(screen.getByTestId('friend-page-remove')).toHaveTextContent('Fjern venn');
  });

  it('8: en runde endte likt — den grå biten, «Én endte likt.» og merket «Likt»', async () => {
    asFriend();
    roundsAre([round(1, 'tied'), round(2, 'you_ahead')], record(3, 2, 1));
    await renderPage({ relation: 'friend' });
    expect(await screen.findByTestId('friend-page-bar-tied', HIDDEN)).toBeTruthy();
    expect(screen.getByTestId('friend-page-leader')).toHaveTextContent(
      'Du leder etter 6 runder mot hverandre. Én endte likt.',
    );
    expect(label('friend-page-score')).toBe('Du 3, Kristian 2, 1 likt');
    expect(within(screen.getByTestId('friend-page-round-g1')).getByText('Likt')).toBeTruthy();
  });

  it('9: stillingen står likt', async () => {
    asFriend();
    roundsAre([round(1, 'you_ahead'), round(2, 'them_ahead')], record(2, 2));
    await renderPage({ relation: 'friend' });
    expect(await screen.findByTestId('friend-page-leader')).toHaveTextContent('Dere står likt etter 4 runder mot hverandre.');
  });

  it('10: bare lagrunder — streken blir borte, «–» og lista står', async () => {
    asFriend();
    roundsAre([round(1, 'same_team'), round(2, 'same_team')], record(0, 0));
    await renderPage({ relation: 'friend' });
    expect(await screen.findByTestId('friend-page-leader')).toHaveTextContent(
      'Dere har ikke spilt mot hverandre ennå. Runder der dere var på samme lag, teller ikke.',
    );
    expect(label('friend-page-score')).toBe('Du og Kristian, ingen runder mot hverandre');
    expect(screen.queryByTestId('friend-page-bar-you', HIDDEN)).toBeNull();
    expect(screen.getByTestId('friend-page-rounds-title')).toHaveTextContent('Runder sammen · 2');
  });

  it('11: ny venn uten ferdig runde — «Dere er venner» uten handicap, og ingen liste', async () => {
    asFriend(null);
    roundsAre([], record(0, 0));
    await renderPage({ relation: 'friend', hcp: null });
    expect(await screen.findByTestId('friend-page-leader')).toHaveTextContent('Dere har ikke spilt mot hverandre ennå.');
    expect(screen.getByTestId('friend-page-subline')).toHaveTextContent(/^Dere er venner$/);
    expect(screen.queryByTestId('friend-page-rounds-title')).toBeNull();
  });

  it('6: uten nett — navnet og handicapet fra lista, kortet med «Prøv igjen», og «Prøv igjen» viser siden', async () => {
    friendsMock.mockResolvedValue({ ok: false, reason: 'offline' });
    roundsMock.mockResolvedValue({ ok: false, reason: 'offline' });
    await renderPage({ relation: 'friend' });
    expect(await screen.findByTestId('friend-page-failure')).toHaveTextContent('Du er uten nett. Koble til og prøv igjen.', { exact: false });
    expect(screen.getByTestId('friend-page-subline')).toHaveTextContent('Dere er venner · handicap 12,4');
    expect(screen.getByTestId('friend-page-remove')).toBeTruthy();

    asFriend();
    roundsAre(SEVEN, record(3, 2));
    await act(async () => {
      fireEvent.press(screen.getByTestId('friend-page-retry'));
    });
    expect(await screen.findByTestId('friend-page-h2h')).toBeTruthy();
    expect(screen.queryByTestId('friend-page-failure')).toBeNull();
  });

  it('12: siden laster ikke — serverlinja i samme kort', async () => {
    asFriend();
    roundsMock.mockResolvedValue({ ok: false, reason: 'load_failed' });
    await renderPage({ relation: 'friend' });
    expect(await screen.findByTestId('friend-page-failure')).toHaveTextContent(
      'Fikk ikke kontakt med serveren. Sjekk tilkoblingen og prøv igjen.',
      { exact: false },
    );
  });

  it('5: «Fjern venn» spør først, fjerner og går tilbake', async () => {
    asFriend();
    roundsAre(SEVEN, record(3, 2));
    removeMock.mockResolvedValue({ ok: true, status: 'removed' });
    const { navigation } = await renderPage({ relation: 'friend' });
    await fireEvent.press(await screen.findByTestId('friend-page-remove'));
    expect(removeMock).not.toHaveBeenCalled();
    const [title, message, buttons, options] = (Alert.alert as unknown as jest.Mock).mock.calls[0] as [
      string,
      string,
      AlertButton[],
      { cancelable: boolean },
    ];
    expect(title).toBe('Fjern venn');
    expect(message).toBe('Vil du fjerne Kristian Holm som venn?');
    expect(buttons.map((b) => b.text)).toEqual(['Avbryt', 'Fjern venn']);
    expect(options.cancelable).toBe(false);
    await act(async () => {
      buttons[1].onPress?.();
    });
    expect(removeMock).toHaveBeenCalledWith(KH);
    expect(navigation.goBack).toHaveBeenCalledTimes(1);
  });

  it('et sent svar på «Fjern venn» flytter ikke en annen skjerm', async () => {
    asFriend();
    roundsAre(SEVEN, record(3, 2));
    removeMock.mockResolvedValue({ ok: true, status: 'removed' });
    const { navigation } = await renderPage({ relation: 'friend' }, { focused: false });
    await fireEvent.press(await screen.findByTestId('friend-page-remove'));
    const buttons = (Alert.alert as unknown as jest.Mock).mock.calls[0][2] as AlertButton[];
    await act(async () => {
      buttons[1].onPress?.();
    });
    expect(removeMock).toHaveBeenCalledWith(KH);
    expect(navigation.goBack).not.toHaveBeenCalled();
  });

  it('uten nett når du fjerner: linja står over knappen, og siden blir stående', async () => {
    asFriend();
    roundsAre(SEVEN, record(3, 2));
    removeMock.mockResolvedValue({ ok: false, reason: 'offline' });
    const { navigation } = await renderPage({ relation: 'friend' });
    await fireEvent.press(await screen.findByTestId('friend-page-remove'));
    const buttons = (Alert.alert as unknown as jest.Mock).mock.calls[0][2] as AlertButton[];
    await act(async () => {
      buttons[1].onPress?.();
    });
    expect(screen.getByTestId('friend-page-error')).toHaveTextContent('Du er uten nett. Koble til og prøv igjen.', { exact: false });
    expect(navigation.goBack).not.toHaveBeenCalled();
  });
});

describe('en som ikke er venn', () => {
  it('2 og 3: fra ligaen — ligaens handicap og de to tallene, og «Legg til venn» gir linja', async () => {
    friendsAre({ suggestions: [{ id: KH, name: 'Kristian Holm', stats: STATS }] });
    notFriends();
    sendMock.mockResolvedValue({ ok: true, status: 'requested' });
    await renderPage({ from: 'league' });
    expect(await screen.findByTestId('friend-page-add')).toHaveTextContent('Legg til venn');
    expect(label('friend-page-hcp')).toBe('Handicap: 12,4');
    expect(label('friend-page-rounds')).toBe('Runder sammen: 2');
    expect(label('friend-page-last')).toMatch(/^Sist spilt: Onsdagsgolfen, /);
    expect(screen.queryByTestId('friend-page-subline')).toBeNull();
    expect(screen.getByTestId('friend-page-hint')).toHaveTextContent(
      'Blir dere venner, ser du her hvordan det har gått mellom dere.',
    );

    await act(async () => {
      fireEvent.press(screen.getByTestId('friend-page-add'));
    });
    expect(sendMock).toHaveBeenCalledWith(KH);
    expect(screen.getByTestId('friend-page-sent')).toHaveTextContent('Venneforespørsel sendt.');
    expect(screen.queryByTestId('friend-page-add')).toBeNull();
  });

  it('mens forespørselen går, står «Sender …» og et nytt trykk gjør ingenting', async () => {
    friendsAre({ suggestions: [{ id: KH, name: 'Kristian Holm', stats: STATS }] });
    notFriends();
    let finish: (value: unknown) => void = () => {};
    sendMock.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    await renderPage({ from: 'league' });
    await fireEvent.press(await screen.findByTestId('friend-page-add'));
    expect(screen.getByTestId('friend-page-add')).toHaveTextContent('Sender …');
    await fireEvent.press(screen.getByTestId('friend-page-add'));
    expect(sendMock).toHaveBeenCalledTimes(1);
    await act(async () => finish({ ok: true, status: 'requested' }));
    expect(screen.getByTestId('friend-page-sent')).toBeTruthy();
  });

  it('7: en handling som feiler — linja i rødt over knappen, og knappen står igjen', async () => {
    friendsAre({ suggestions: [{ id: KH, name: 'Kristian Holm', stats: STATS }] });
    notFriends();
    sendMock.mockResolvedValueOnce({ ok: false, reason: 'network' });
    await renderPage({ from: 'league' });
    await act(async () => {
      fireEvent.press(await screen.findByTestId('friend-page-add'));
    });
    expect(screen.getByTestId('friend-page-error')).toHaveTextContent(
      'Fikk ikke kontakt med serveren. Sjekk tilkoblingen og prøv igjen.',
    );
    expect(screen.getByTestId('friend-page-add')).not.toBeDisabled();
  });

  it('4 og 13: de har sendt deg en forespørsel — «Godta», og så står dere som venner med rundene', async () => {
    friendsAre({ incoming: [{ id: KH, name: 'Kristian Holm', stats: STATS, requestId: 'req-in' }] });
    notFriends();
    respondMock.mockResolvedValue({ ok: true, status: 'accepted' });
    await renderPage({ from: 'friends', hcp: null, relation: 'incoming' });
    expect(await screen.findByTestId('friend-page-subline')).toHaveTextContent('Vil bli venn med deg');
    // Fra Venner har siden ikke noe handicap for en som ikke er venn.
    expect(screen.queryByTestId('friend-page-hcp')).toBeNull();
    expect(label('friend-page-rounds')).toBe('Runder sammen: 2');

    asFriend(null);
    roundsAre([round(1, 'you_ahead')], record(1, 0));
    await act(async () => {
      fireEvent.press(screen.getByTestId('friend-page-accept'));
    });
    expect(respondMock).toHaveBeenCalledWith('req-in', true);
    expect(await screen.findByTestId('friend-page-h2h')).toBeTruthy();
    expect(screen.getByTestId('friend-page-subline')).toHaveTextContent('Dere er venner');
    expect(screen.queryByTestId('friend-page-accept')).toBeNull();
  });

  it('14: du har sendt, fra Venner — linja der knappen var, uten handicaprad', async () => {
    friendsAre({ outgoing: [{ id: KH, name: 'Kristian Holm', stats: STATS, requestId: 'req-out' }] });
    notFriends();
    await renderPage({ from: 'friends', hcp: null, relation: 'outgoing' });
    expect(await screen.findByTestId('friend-page-sent')).toHaveTextContent('Venneforespørsel sendt.');
    expect(screen.queryByTestId('friend-page-hcp')).toBeNull();
  });

  it('15: et forslag, fra Venner — ingen handicaprad og ingen runder eller stilling', async () => {
    friendsAre({ suggestions: [{ id: KH, name: 'Kristian Holm', stats: STATS }] });
    notFriends();
    await renderPage({ from: 'friends', hcp: null, relation: 'none' });
    expect(await screen.findByTestId('friend-page-add')).toBeTruthy();
    expect(screen.queryByTestId('friend-page-hcp')).toBeNull();
    expect(screen.queryByTestId('friend-page-h2h')).toBeNull();
    expect(screen.queryByTestId('friend-page-rounds-title')).toBeNull();
  });

  it('rundene vises aldri for en som ikke er venn, selv om ruta skulle svare', async () => {
    friendsAre({ suggestions: [{ id: KH, name: 'Kristian Holm', stats: STATS }] });
    roundsAre(SEVEN, record(3, 2));
    await renderPage({ from: 'league' });
    expect(await screen.findByTestId('friend-page-add')).toBeTruthy();
    expect(screen.queryByTestId('friend-page-h2h')).toBeNull();
    expect(screen.queryByTestId('friend-page-round-g1')).toBeNull();
    expect(screen.queryByTestId('friend-page-remove')).toBeNull();
  });
});

describe('0 runder sammen (16–20)', () => {
  it('16: vil bli venn med deg, fra Venner — setningen, ingen rader, og «Godta»', async () => {
    friendsAre({ incoming: [{ id: KH, name: 'Sindre Vik', stats: ZERO, requestId: 'req-in' }] });
    notFriends();
    await renderPage({ name: 'Sindre Vik', from: 'friends', hcp: null, relation: 'incoming' });
    expect(await screen.findByTestId('friend-page-no-rounds')).toHaveTextContent('Dere har ingen runder sammen ennå.');
    expect(screen.queryByTestId('friend-page-hcp')).toBeNull();
    expect(screen.queryByTestId('friend-page-rounds')).toBeNull();
    expect(screen.getByTestId('friend-page-accept')).toBeTruthy();
  });

  it('17: et forslag med 0 runder, fra Venner — setningen og «Legg til venn»', async () => {
    friendsAre({ suggestions: [{ id: KH, name: 'Per Lund', stats: ZERO }] });
    notFriends();
    await renderPage({ name: 'Per Lund', from: 'friends', hcp: null, relation: 'none' });
    expect(await screen.findByTestId('friend-page-no-rounds')).toBeTruthy();
    expect(screen.queryByTestId('friend-page-rounds')).toBeNull();
    expect(screen.getByTestId('friend-page-add')).toBeTruthy();
  });

  it('18: vil bli venn med deg, fra ligaen — ligaens handicap som eneste rad', async () => {
    friendsAre({ incoming: [{ id: KH, name: 'Sindre Vik', stats: ZERO, requestId: 'req-in' }] });
    notFriends();
    await renderPage({ name: 'Sindre Vik', from: 'league', hcp: 18.3 });
    expect(await screen.findByTestId('friend-page-no-rounds')).toBeTruthy();
    expect(label('friend-page-hcp')).toBe('Handicap: 18,3');
    expect(screen.queryByTestId('friend-page-rounds')).toBeNull();
    expect(screen.getByTestId('friend-page-accept')).toBeTruthy();
  });

  it('19: ikke venner og aldri spilt sammen, fra ligaen — handicapet og setningen', async () => {
    friendsAre({});
    notFriends();
    await renderPage({ name: 'Mari Dahl', from: 'league', hcp: 22.1 });
    expect(await screen.findByTestId('friend-page-no-rounds')).toBeTruthy();
    expect(label('friend-page-hcp')).toBe('Handicap: 22,1');
    expect(screen.getByTestId('friend-page-add')).toBeTruthy();
  });

  it('uten handicap i ligaen står det ikke noe radkort', async () => {
    friendsAre({});
    notFriends();
    await renderPage({ name: 'Mari Dahl', from: 'league', hcp: null });
    expect(await screen.findByTestId('friend-page-no-rounds')).toBeTruthy();
    expect(screen.queryByTestId('friend-page-hcp')).toBeNull();
  });
});
