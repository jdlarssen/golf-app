// native/app/src/screens/Inbox.navigator.test.tsx
// #2759: et trykk i den ekte skjermen, i en ekte navigator. Type C.
//
// `lib/inboxBack.router.test.ts` viser alle målene mot ruteren. Her er det
// skjermens egen `navigation` som åpner to skjermer rett etter hverandre, og
// tilbake derfra skal lande i innboksen. Ingen mocking av navigasjonen.
/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock-fabrikkene heises over importene og må bruke require */
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { View } from 'react-native';
import type { InboxWire, InboxWireEntry } from '../../../../lib/notifications/inboxWire';
import { loadInbox } from '../data/inbox';
import type { RootStackParamList } from '../navigation';
import { Inbox } from './Inbox';

jest.mock('../supabase', () => require('../test/supabaseMock'));
jest.mock('react-native-safe-area-context', () => require('../test/safeAreaMock').safeAreaMock());
jest.mock('../data/syncTriggers', () => require('../test/syncTriggersMock'));
jest.mock('../data/inbox', () => ({
  loadInbox: jest.fn(),
  decideRequest: jest.fn(),
  markAllRead: jest.fn(),
  clearRead: jest.fn(),
}));
jest.mock('../data/markRead', () => ({ markNotificationIdsRead: jest.fn(async () => undefined) }));

const Stack = createNativeStackNavigator<RootStackParamList>();
const ref = createNavigationContainerRef<RootStackParamList>();
const Stub = () => <View />;

const REVIEW: InboxWireEntry = {
  key: 'peer',
  title: '2 scorekort venter på deg',
  subtitle: 'Lørdagsrunden',
  subtitleIsFreeText: false,
  quote: null,
  body: null,
  cta: null,
  avatar: { kind: 'people', initials: ['ML'], more: 0 },
  placeLabel: null,
  destination: '/games/g1/approve',
  actionKey: 'review',
  unread: true,
  unreadIds: ['a'],
  friend: false,
  decidable: false,
};
const FRIEND: InboxWireEntry = {
  ...REVIEW,
  key: 'friend',
  title: 'Anders la deg til som venn',
  destination: '/profile/venner',
  actionKey: null,
  unread: false,
  unreadIds: [],
  friend: true,
};
const BOARD: InboxWire = {
  actionCount: 1,
  hasUnread: true,
  unreadCount: 3,
  sections: { action: [REVIEW], today: [FRIEND], earlier: [] },
};

const names = () => ref.getRootState()?.routes.map((route) => route.name);

async function fromInbox() {
  (loadInbox as jest.Mock).mockResolvedValue({ ok: true, board: BOARD });
  await render(
    <NavigationContainer ref={ref}>
      <Stack.Navigator>
        <Stack.Screen name="Home" component={Stub} />
        <Stack.Screen name="Inbox" component={Inbox} />
        <Stack.Screen name="GameHome" component={Stub} />
        <Stack.Screen name="Approve" component={Stub} />
        <Stack.Screen name="Friends" component={Stub} />
      </Stack.Navigator>
    </NavigationContainer>,
  );
  await act(async () => {
    ref.navigate('Inbox');
  });
}

async function back() {
  await act(async () => {
    ref.goBack();
  });
}

describe('tilbake fra innboksen', () => {
  it('godkjenningen åpnes med spillet under, og to steg tilbake lander i innboksen', async () => {
    await fromInbox();
    await fireEvent.press(screen.getByTestId('inbox-action-open'));
    expect(names()).toEqual(['Home', 'Inbox', 'GameHome', 'Approve']);
    await back();
    expect(names()).toEqual(['Home', 'Inbox', 'GameHome']);
    await back();
    expect(names()).toEqual(['Home', 'Inbox']);
  });

  it('vennene åpnes rett over, og fokus henter lista på nytt', async () => {
    await fromInbox();
    const loads = (loadInbox as jest.Mock).mock.calls.length;
    await fireEvent.press(screen.getByText('Anders la deg til som venn'));
    expect(names()).toEqual(['Home', 'Inbox', 'Friends']);
    await back();
    expect(names()).toEqual(['Home', 'Inbox']);
    expect((loadInbox as jest.Mock).mock.calls.length).toBeGreaterThan(loads);
  });
});
