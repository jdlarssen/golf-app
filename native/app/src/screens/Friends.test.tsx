// native/app/src/screens/Friends.test.tsx
// #2256: vennesiden (Type C).
//
// Tekstene er `friendsCopy.test.ts` sine (paritet mot webben, underlinjene),
// og hvilken sti og kropp hver handling sender, er `data/friends.test.ts`
// sitt. Her låses koblingene bare en render kan bekrefte: seksjonene står når
// det finnes noe i dem, knappene kaller riktig handling og lista hentes på
// nytt, alle radene åpner vennesiden (#2381) mens knappene ikke gjør det,
// lista hentes på nytt når du kommer tilbake, «På e-post» viser feltet, en
// ukjent adresse gir tilbudet om invitasjon, og uten nett står linja om
// tilkobling.
//
// Tre renders og ikke én: full liste, tom liste og uten nett er tilstander
// skjermen ikke kan være i samtidig (samme grunn som Profile.test.tsx).
/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock-fabrikkene heises over importene og må bruke require */
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Share } from 'react-native';
import {
  addFriendByEmail,
  fetchFriends,
  removeFriend,
  respondToFriendRequest,
  sendFriendRequest,
} from '../data/friends';
import { FRIENDS_TEXT, addByEmailLine, friendStatusLine } from '../lib/friendsCopy';
import type { ScreenProps } from '../navigation';
import { Friends } from './Friends';
import { setBottomInset, bottomPadding } from '../test/safeAreaMock';

jest.mock('../supabase', () => require('../test/supabaseMock'));
jest.mock('react-native-safe-area-context', () => require('../test/safeAreaMock').safeAreaMock());
// #2201: merk-lest har sin egen test; manuell mock i lib/__mocks__/.
jest.mock('../lib/useMarkVisitRead');
jest.mock('../data/friends', () => ({
  fetchFriends: jest.fn(),
  sendFriendRequest: jest.fn(),
  addFriendByEmail: jest.fn(),
  respondToFriendRequest: jest.fn(),
  removeFriend: jest.fn(),
}));
// Fokuset kjøres som en effekt, og testen kan fokusere skjermen igjen (som League.test.tsx).
let mockFocus: () => void = () => {};
jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (callback: () => void) => {
    mockFocus = callback;
    require('react').useEffect(callback, [callback]);
  },
}));
jest.mock('../lib/webLink', () => ({
  ...jest.requireActual('../lib/webLink'),
  webUrl: (path: string) => ({ ok: true, url: `https://staging.example${path}` }),
}));

const fetchFriendsMock = fetchFriends as jest.Mock;
const respondMock = respondToFriendRequest as jest.Mock;
const removeMock = removeFriend as jest.Mock;
const sendMock = sendFriendRequest as jest.Mock;
const addByEmailMock = addFriendByEmail as jest.Mock;

const NONE = { roundsTogether: 0, lastPlayedAt: null, lastGameName: null };
const FULL = {
  friends: [
    {
      id: 'kari',
      name: 'Kari',
      hcp: 9.4,
      stats: { roundsTogether: 8, lastPlayedAt: '2026-09-26T09:00:00Z', lastGameName: 'Onsdagsgolfen' },
    },
  ],
  incoming: [{ requestId: 'req-1', id: 'ola', name: 'Ola', stats: NONE }],
  outgoing: [{ requestId: 'req-2', id: 'per', name: 'Per', stats: NONE }],
  suggestions: [{ id: 'siri', name: 'Siri', stats: NONE }],
  friendCode: 'KODE123',
};
const EMPTY = { friends: [], incoming: [], outgoing: [], suggestions: [], friendCode: null };

async function renderScreen(params?: { selfInitials?: string }) {
  const push = jest.fn();
  await render(
    <Friends {...({ navigation: { push }, route: { params } } as unknown as ScreenProps<'Friends'>)} />,
  );
  return { push };
}

describe('Friends', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // #1954 D3: med tre knapper på Android ligger navigasjonslinja over bunnen av
  // skjermen. Innholdet skal ende over den, med samme luft som før.
  it('legger systemlinja til bunnluften', async () => {
    setBottomInset(48);
    try {
      fetchFriendsMock.mockResolvedValue({ ok: true, data: FULL });
      await renderScreen();
      await screen.findByTestId('friends-hero');
      expect(bottomPadding('friends-screen')).toBe(32 + 48);
    } finally {
      setBottomInset(0);
    }
  });

  // Kontrollrunden på #2624: varianten når vennelista ikke kunne hentes.
  it('lista kom ikke: luften under står også over systemlinja', async () => {
    fetchFriendsMock.mockResolvedValueOnce({ ok: false, reason: 'offline' });
    setBottomInset(48);
    try {
      await renderScreen();
      await screen.findByTestId('friends-load-error');
      expect(bottomPadding('friends-screen')).toBe(20 + 48);
    } finally {
      setBottomInset(0);
    }
  });

  // #2930: tre forslag er bredere enn skjermen. Kanten toner, så det synes at
  // raden kan rulles, og fire pt av kort 2 er ikke lenger det eneste hintet.
  it('venneforslagene toner ut i høyre kant når det er flere enn som får plass', async () => {
    const many = ['siri', 'jon', 'eva'].map((id) => ({ id, name: id, stats: NONE }));
    fetchFriendsMock.mockResolvedValue({ ok: true, data: { ...FULL, suggestions: many } });
    await renderScreen();
    const row = await screen.findByTestId('friends-suggestion-row');
    await fireEvent(row, 'layout', { nativeEvent: { layout: { width: 358, height: 150 } } });
    await fireEvent(row, 'contentSizeChange', 548, 150);
    expect(screen.getByTestId('edge-fade-right', { hidden: true })).toBeTruthy();
    expect(screen.queryByTestId('edge-fade-left', { hidden: true })).toBeNull();
    expect(screen.getByTestId('friends-open-eva')).toBeTruthy();
  });

  it('viser seksjonene, godtar, trekker tilbake og deler lenka', async () => {
    fetchFriendsMock.mockResolvedValue({ ok: true, data: FULL });
    respondMock.mockResolvedValue({ ok: true, status: 'accepted' });
    removeMock.mockResolvedValue({ ok: true, status: 'removed' });
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' });
    await renderScreen();

    for (const id of ['friends-hero', 'friends-incoming', 'friends-list', 'friends-outgoing', 'friends-suggestions']) {
      expect(await screen.findByTestId(id)).toBeTruthy();
    }
    // E-postfeltet står bak «På e-post».
    expect(screen.queryByTestId('friends-add-by-email')).toBeNull();
    // «Sist spilt først» står ved etiketten også med én venn (designet).
    expect(screen.getByTestId('friends-sort-note')).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByTestId('friends-accept-ola'));
    });
    expect(respondMock).toHaveBeenCalledWith('req-1', true);
    expect(screen.getByTestId('friends-status')).toHaveTextContent(friendStatusLine('accepted')!.text);
    // Lista hentes på nytt etter handlingen.
    expect(fetchFriendsMock).toHaveBeenCalledTimes(2);

    await act(async () => {
      fireEvent.press(screen.getByTestId('friends-withdraw-per'));
    });
    expect(removeMock).toHaveBeenCalledWith('per');

    await act(async () => {
      fireEvent.press(screen.getByTestId('friends-share-link'));
    });
    expect(share).toHaveBeenCalledWith({ message: 'https://staging.example/venner/legg-til/KODE123' });
  });

  // #2381: alle radene åpner vennesiden, med «Venner» som tilbake-ord.
  it('en venn, en forespørsel, et forslag og en sendt forespørsel åpner vennesiden', async () => {
    fetchFriendsMock.mockResolvedValue({ ok: true, data: FULL });
    const { push } = await renderScreen({ selfInitials: 'SA' });
    await screen.findByTestId('friends-list');

    const cases = [
      ['kari', { name: 'Kari', hcp: 9.4, relation: 'friend' }],
      ['ola', { name: 'Ola', hcp: null, relation: 'incoming' }],
      ['siri', { name: 'Siri', hcp: null, relation: 'none' }],
      ['per', { name: 'Per', hcp: null, relation: 'outgoing' }],
    ] as const;
    for (const [id, expected] of cases) {
      push.mockClear();
      await fireEvent.press(screen.getByTestId(`friends-open-${id}`));
      expect(push).toHaveBeenCalledWith('FriendPage', {
        userId: id,
        from: 'friends',
        selfInitials: 'SA',
        ...expected,
      });
    }
    expect(screen.getByLabelText('Åpne Ola')).toBeTruthy();
    expect(screen.getByLabelText('Åpne Siri')).toBeTruthy();
    expect(screen.getByLabelText('Åpne Per')).toBeTruthy();
  });

  it('knappene ved siden av navnet gjør det de gjorde, og åpner ikke siden', async () => {
    fetchFriendsMock.mockResolvedValue({ ok: true, data: FULL });
    respondMock.mockResolvedValue({ ok: true, status: 'declined' });
    sendMock.mockResolvedValue({ ok: true, status: 'requested' });
    removeMock.mockResolvedValue({ ok: true, status: 'removed' });
    const { push } = await renderScreen();
    await screen.findByTestId('friends-list');

    for (const button of ['friends-decline-ola', 'friends-add-siri', 'friends-withdraw-per', 'friends-accept-ola']) {
      await act(async () => {
        fireEvent.press(screen.getByTestId(button));
      });
    }
    expect(respondMock).toHaveBeenCalledWith('req-1', false);
    expect(respondMock).toHaveBeenCalledWith('req-1', true);
    expect(sendMock).toHaveBeenCalledWith('siri');
    expect(removeMock).toHaveBeenCalledWith('per');
    expect(push).not.toHaveBeenCalled();
  });

  it('henter lista på nytt når du kommer tilbake fra vennesiden, ikke ved første visning', async () => {
    fetchFriendsMock.mockResolvedValue({ ok: true, data: FULL });
    await renderScreen();
    await screen.findByTestId('friends-list');
    expect(fetchFriendsMock).toHaveBeenCalledTimes(1);

    const withoutOla = { ...FULL, incoming: [], friends: [...FULL.friends, { id: 'ola', name: 'Ola', hcp: null, stats: NONE }] };
    fetchFriendsMock.mockResolvedValue({ ok: true, data: withoutOla });
    await act(async () => {
      mockFocus();
    });
    expect(fetchFriendsMock).toHaveBeenCalledTimes(2);
    expect(screen.queryByTestId('friends-incoming')).toBeNull();
    expect(screen.getByTestId('friends-open-ola')).toBeTruthy();
  });

  it('viser tomtilstanden, og gir samme kvittering for enhver adresse', async () => {
    fetchFriendsMock.mockResolvedValue({ ok: true, data: EMPTY });
    addByEmailMock.mockResolvedValue({ ok: true, status: 'requested' });
    await renderScreen();

    expect(await screen.findByTestId('friends-empty')).toBeTruthy();
    expect(screen.queryByTestId('friends-incoming')).toBeNull();
    expect(screen.queryByTestId('friends-share-link')).toBeNull();

    await fireEvent.press(screen.getByTestId('friends-email-toggle'));
    await fireEvent.changeText(screen.getByTestId('friends-email-input'), 'Ny@Example.com');
    await act(async () => {
      fireEvent.press(screen.getByTestId('friends-email-submit'));
    });
    expect(addByEmailMock).toHaveBeenCalledWith('ny@example.com');
    expect(screen.getByTestId('friends-status')).toHaveTextContent(addByEmailLine('requested').text);
    // Ett steg: ingen egen invitasjon å trykke på etterpå.
    expect(screen.queryByTestId('friends-invite-offer')).toBeNull();
    expect(screen.getByTestId('friends-email-input').props.value).toBe('');
  });

  it('sier hvorfor når adressen ikke kan brukes, og lar den stå', async () => {
    fetchFriendsMock.mockResolvedValue({ ok: true, data: EMPTY });
    addByEmailMock.mockResolvedValue({ ok: true, status: 'quota' });
    await renderScreen();
    await screen.findByTestId('friends-empty');

    await fireEvent.press(screen.getByTestId('friends-email-toggle'));
    await fireEvent.changeText(screen.getByTestId('friends-email-input'), 'ny@example.com');
    await act(async () => {
      fireEvent.press(screen.getByTestId('friends-email-submit'));
    });
    expect(screen.getByTestId('friends-status')).toHaveTextContent(addByEmailLine('quota').text);
    expect(screen.getByTestId('friends-email-input').props.value).toBe('ny@example.com');
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
