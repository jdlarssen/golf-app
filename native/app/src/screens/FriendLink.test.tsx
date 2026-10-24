// native/app/src/screens/FriendLink.test.tsx
// #2627: «Bli venn med …», render-testen (Type C). Én test som går gjennom
// tilstandene på tegningene: hvilken flate som står, og at knappene gjør det
// de skal. Hva ruta svarer, og hvordan svaret oversettes, er Type A i
// `data/friends.test.ts`; tekstene er låst mot nettsiden i `friendsCopy.test.ts`.
/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock-fabrikkene heises over importene og må bruke require */
import { fireEvent, render, screen } from '@testing-library/react-native';
import { connectFriendLink, fetchFriendLink } from '../data/friends';
import {
  FRIEND_LINK_TEXT,
  FRIENDS_TEXT,
  friendLinkConnectCard,
  friendStatusLine,
  friendsFailureLine,
} from '../lib/friendsCopy';
import type { ScreenProps } from '../navigation';
import { FriendLink } from './FriendLink';

jest.mock('../supabase', () => require('../test/supabaseMock'));
jest.mock('react-native-safe-area-context', () => require('../test/safeAreaMock').safeAreaMock());
jest.mock('../data/friends', () => ({
  fetchFriendLink: jest.fn(),
  connectFriendLink: jest.fn(),
}));
jest.mock('../session', () => ({
  useSession: () => ({ userId: 'meg', email: 'meg@example.test' }),
}));
jest.mock('../data/profile', () => ({
  fetchOwnProfile: jest.fn(async () => ({
    name: 'Sander Aas',
    nickname: null,
    hcpIndex: 12,
    handicapUpdatedAt: null,
    gender: null,
    level: null,
    isAdmin: false,
    profileCompletedAt: '2026-01-01T00:00:00Z',
    createdAt: null,
  })),
}));

const fetchMock = fetchFriendLink as jest.Mock;
const connectMock = connectFriendLink as jest.Mock;
const replace = jest.fn();

async function renderScreen() {
  return render(
    <FriendLink
      {...({ navigation: { replace }, route: { params: { code: 'abcd1234' } } } as unknown as ScreenProps<'FriendLink'>)}
    />,
  );
}

describe('FriendLink', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('viser tilstandene fra tegningene, og «Bli venner» gjør dere til venner', async () => {
    // Bli venn med: navnet stort, skogkortet med setningen og knappen.
    fetchMock.mockResolvedValue({ ok: true, relation: 'connectable', name: 'Marte Lie «Mos»' });
    // Feilgrenene først: uten nett, en feil fra ruta og «allerede venner».
    // Kortet og knappen står etter de to første; den tredje bytter kort.
    connectMock.mockResolvedValueOnce({ ok: false, reason: 'offline' });
    connectMock.mockResolvedValueOnce({ ok: true, status: 'error' });
    connectMock.mockResolvedValueOnce({ ok: true, status: 'already_friends' });
    connectMock.mockResolvedValueOnce({ ok: true, status: 'accepted' });
    const view = await renderScreen();
    expect(fetchMock).toHaveBeenCalledWith('abcd1234');
    expect(await screen.findByRole('header')).toHaveTextContent('Marte Lie «Mos»');
    expect(screen.getByTestId('friend-link-connect')).toBeTruthy();
    expect(screen.getByText(friendLinkConnectCard('Marte Lie «Mos»'))).toBeTruthy();
    // Initialene uten kallenavnet.
    expect(screen.getByText('ML', { includeHiddenElements: true })).toBeTruthy();

    const connectButton = () => screen.getByRole('button', { name: FRIEND_LINK_TEXT.connectButton });
    await fireEvent.press(connectButton());
    expect(connectMock).toHaveBeenCalledWith('abcd1234');
    expect(screen.getByTestId('friend-link-status')).toHaveTextContent(friendsFailureLine('offline'));
    expect(connectButton()).toBeTruthy();

    await fireEvent.press(connectButton());
    expect(screen.getByTestId('friend-link-status')).toHaveTextContent(FRIEND_LINK_TEXT.errorBanner);
    expect(connectButton()).toBeTruthy();

    await fireEvent.press(connectButton());
    expect(screen.getByTestId('friend-link-already_friends')).toBeTruthy();
    expect(screen.queryByTestId('friend-link-connect')).toBeNull();
    await view.unmount();

    // Bli venner, så «Dere er venner nå!» og veien til vennene, med dine
    // initialer og pila «Tilbake».
    const fresh = await renderScreen();
    await fireEvent.press(await screen.findByRole('button', { name: FRIEND_LINK_TEXT.connectButton }));
    expect(screen.getByTestId('friend-link-connected')).toBeTruthy();
    expect(screen.getByText(friendStatusLine('accepted')!.text)).toBeTruthy();
    expect(screen.queryByTestId('friend-link-connect')).toBeNull();

    await fireEvent.press(screen.getByRole('button', { name: FRIEND_LINK_TEXT.toFriendsLink }));
    expect(replace).toHaveBeenCalledWith('Friends', { selfInitials: 'SA', from: 'friendLink' });
    await fresh.unmount();

    // Allerede venner: nettsidens setning og veien til vennene.
    fetchMock.mockResolvedValue({ ok: true, relation: 'already_friends', name: 'Marte Lie' });
    let next = await renderScreen();
    expect(await screen.findByTestId('friend-link-already_friends')).toBeTruthy();
    expect(screen.getByText(FRIEND_LINK_TEXT.alreadyFriendsCard)).toBeTruthy();
    expect(screen.getByRole('button', { name: FRIEND_LINK_TEXT.toFriendsLink })).toBeTruthy();
    await next.unmount();

    // Din egen kode: ingen knapp.
    fetchMock.mockResolvedValue({ ok: true, relation: 'self', name: 'Sander Aas' });
    next = await renderScreen();
    expect(await screen.findByTestId('friend-link-self')).toHaveTextContent(FRIEND_LINK_TEXT.selfCard);
    expect(screen.queryByRole('button')).toBeNull();
    await next.unmount();

    // Ukjent kode: egen tittel, ingen knapp.
    fetchMock.mockResolvedValue({ ok: false, reason: 'not_found' });
    next = await renderScreen();
    expect(await screen.findByRole('header')).toHaveTextContent(FRIEND_LINK_TEXT.unknownTitle);
    expect(screen.getByTestId('friend-link-unknown')).toHaveTextContent(FRIEND_LINK_TEXT.unknownBody);
    await next.unmount();

    // Feil ved lasting: linja og «Prøv igjen», som henter på nytt.
    fetchMock.mockResolvedValueOnce({ ok: false, reason: 'load_failed' });
    fetchMock.mockResolvedValueOnce({ ok: true, relation: 'connectable', name: 'Marte Lie' });
    await renderScreen();
    expect(await screen.findByTestId('friend-link-load-error')).toHaveTextContent(FRIEND_LINK_TEXT.loadFailed);
    await fireEvent.press(screen.getByRole('button', { name: FRIENDS_TEXT.retry }));
    expect(await screen.findByTestId('friend-link-connect')).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(7);
  });
});
