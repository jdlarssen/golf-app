// native/app/src/screens/Friends.test.tsx
// #2256: vennesiden (Type C).
//
// Tekstene er `friendsCopy.test.ts` sine (paritet mot webben), og hvilken sti
// og kropp hver handling sender, er `data/friends.test.ts` sitt. Her låses
// koblingene bare en render kan bekrefte: seksjonene står når det finnes noe
// i dem, knappene kaller riktig handling og lista hentes på nytt, «Fjern»
// spør først, en ukjent adresse gir tilbudet om invitasjon, og uten nett
// står linja om tilkobling.
//
// Tre renders og ikke én: full liste, tom liste og uten nett er tilstander
// skjermen ikke kan være i samtidig (samme grunn som Profile.test.tsx).
/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock-fabrikkene heises over importene og må bruke require */
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Alert, Share, type AlertButton } from 'react-native';
import {
  addFriendByEmail,
  fetchFriends,
  inviteFriend,
  removeFriend,
  respondToFriendRequest,
} from '../data/friends';
import { FRIENDS_TEXT, friendStatusLine, invitedLine } from '../lib/friendsCopy';
import type { ScreenProps } from '../navigation';
import { Friends } from './Friends';

jest.mock('../supabase', () => require('../test/supabaseMock'));
jest.mock('../data/friends', () => ({
  fetchFriends: jest.fn(),
  sendFriendRequest: jest.fn(),
  addFriendByEmail: jest.fn(),
  respondToFriendRequest: jest.fn(),
  removeFriend: jest.fn(),
  inviteFriend: jest.fn(),
}));
jest.mock('../lib/webLink', () => ({
  ...jest.requireActual('../lib/webLink'),
  webUrl: (path: string) => ({ ok: true, url: `https://staging.example${path}` }),
}));

const fetchFriendsMock = fetchFriends as jest.Mock;
const respondMock = respondToFriendRequest as jest.Mock;
const removeMock = removeFriend as jest.Mock;
const addByEmailMock = addFriendByEmail as jest.Mock;
const inviteMock = inviteFriend as jest.Mock;

const FULL = {
  friends: [{ id: 'kari', name: 'Kari' }],
  incoming: [{ requestId: 'req-1', id: 'ola', name: 'Ola' }],
  outgoing: [{ requestId: 'req-2', id: 'per', name: 'Per' }],
  suggestions: [{ id: 'siri', name: 'Siri' }],
  friendCode: 'KODE123',
};
const EMPTY = { friends: [], incoming: [], outgoing: [], suggestions: [], friendCode: null };

async function renderScreen() {
  await render(<Friends {...({ navigation: {}, route: {} } as unknown as ScreenProps<'Friends'>)} />);
}

describe('Friends', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('viser seksjonene, godtar, spør før den fjerner og deler lenka', async () => {
    fetchFriendsMock.mockResolvedValue({ ok: true, data: FULL });
    respondMock.mockResolvedValue({ ok: true, status: 'accepted' });
    removeMock.mockResolvedValue({ ok: true, status: 'removed' });
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' });
    await renderScreen();

    for (const id of ['friends-incoming', 'friends-list', 'friends-outgoing', 'friends-suggestions', 'friends-add-by-email', 'friends-share']) {
      expect(await screen.findByTestId(id)).toBeTruthy();
    }

    await act(async () => {
      fireEvent.press(screen.getByTestId('friends-accept-ola'));
    });
    expect(respondMock).toHaveBeenCalledWith('req-1', true);
    expect(screen.getByTestId('friends-status')).toHaveTextContent(friendStatusLine('accepted')!.text);
    // Lista hentes på nytt etter handlingen.
    expect(fetchFriendsMock).toHaveBeenCalledTimes(2);

    // «Fjern» spør først, og bare «Fjern venn» fjerner.
    await fireEvent.press(screen.getByTestId('friends-remove-kari'));
    expect(removeMock).not.toHaveBeenCalled();
    const [, , buttons, options] = (Alert.alert as unknown as jest.Mock).mock.calls[0] as [
      string,
      string,
      AlertButton[],
      { cancelable: boolean },
    ];
    expect(buttons.map((b) => b.text)).toEqual([FRIENDS_TEXT.cancelLabel, FRIENDS_TEXT.removeConfirmLabel]);
    expect(options.cancelable).toBe(false);
    await act(async () => {
      buttons[1].onPress?.();
    });
    expect(removeMock).toHaveBeenCalledWith('kari');

    await act(async () => {
      fireEvent.press(screen.getByTestId('friends-share-link'));
    });
    expect(share).toHaveBeenCalledWith({ message: 'https://staging.example/venner/legg-til/KODE123' });
  });

  it('viser tomtilstanden, og tilbyr invitasjon når adressen ikke er på Tørny', async () => {
    fetchFriendsMock.mockResolvedValue({ ok: true, data: EMPTY });
    addByEmailMock.mockResolvedValue({ ok: true, status: 'not_found' });
    inviteMock.mockResolvedValue({ ok: true, status: 'invited' });
    await renderScreen();

    expect(await screen.findByTestId('friends-empty')).toBeTruthy();
    expect(screen.queryByTestId('friends-incoming')).toBeNull();
    expect(screen.queryByTestId('friends-share')).toBeNull();

    await fireEvent.changeText(screen.getByTestId('friends-email-input'), 'Ny@Example.com');
    await act(async () => {
      fireEvent.press(screen.getByTestId('friends-email-submit'));
    });
    expect(addByEmailMock).toHaveBeenCalledWith('ny@example.com');
    expect(screen.getByTestId('friends-invite-offer')).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByTestId('friends-invite'));
    });
    expect(inviteMock).toHaveBeenCalledWith('ny@example.com');
    expect(screen.getByTestId('friends-status')).toHaveTextContent(invitedLine('ny@example.com'));
    expect(screen.queryByTestId('friends-invite-offer')).toBeNull();
  });

  it('sier at venner krever nett, og prøver igjen', async () => {
    fetchFriendsMock.mockResolvedValueOnce({ ok: false, reason: 'offline' });
    await renderScreen();

    expect(await screen.findByTestId('friends-load-error')).toHaveTextContent(FRIENDS_TEXT.offline);

    fetchFriendsMock.mockResolvedValueOnce({ ok: true, data: EMPTY });
    await act(async () => {
      fireEvent.press(screen.getByTestId('friends-retry'));
    });
    expect(await screen.findByTestId('friends-empty')).toBeTruthy();
  });
});
