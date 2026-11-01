// native/app/src/screens/CreateGame.navigator.test.tsx
// #2746: veiviseren i en ekte navigator. Type C.
//
// `CreateGame.test.tsx` mocker `usePreventRemove`, så den kan ikke vise at
// sperra faktisk stanser navigatoren. Her er både hooken, ruteren og
// native-stack ekte. `navigationRef.goBack()` er det pila og Androids
// tilbakeknapp sender. Selve trykket, og sveipet på iPhone, kan ikke kjøres i
// jest og står i tapptesten.
/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock-factories heises over importene og må bruke require */
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { View } from 'react-native';
import type { RootStackParamList } from '../navigation';
import { SessionProvider } from '../session';
import { CreateGame } from './CreateGame';

jest.mock('../supabase', () => require('../test/supabaseMock'));
jest.mock('../data/syncTriggers', () => require('../test/syncTriggersMock'));
jest.mock('../data/formatCatalog', () => ({
  ...jest.requireActual('../data/formatCatalog'),
  fetchFormatCatalog: jest.fn(async () => [
    { slug: 'stableford', label: 'Stableford', iconKey: 'flag', isPrimary: true, sortOrder: 1 },
  ]),
}));
jest.mock('../data/profile', () => ({
  fetchOwnProfile: jest.fn(async () => ({
    name: 'Jørgen Arrangør',
    nickname: null,
    hcpIndex: 12.4,
    handicapUpdatedAt: null,
    gender: 'mens',
    level: null,
    isAdmin: false,
    profileCompletedAt: '2026-01-01T10:00:00.000Z',
    createdAt: '2026-01-01T09:00:00.000Z',
  })),
}));
jest.mock('../data/createGame', () => ({
  fetchCourses: jest.fn(async () => []),
  fetchRosterCandidates: jest.fn(async () => []),
  publishGame: jest.fn(),
  newGameId: jest.fn(() => 'wizard-game-id'),
}));

const Stack = createNativeStackNavigator<RootStackParamList>();
const ref = createNavigationContainerRef<RootStackParamList>();

const HomeStub = () => <View testID="home-stub" />;

const wizardIsOpen = () => ref.getRootState()?.routes.at(-1)?.name === 'CreateGame';

async function pressBack() {
  await act(async () => {
    ref.goBack();
  });
}

describe('CreateGame i en ekte navigator (#2746)', () => {
  it('tilbake går ett steg med valgene beholdt, og første steg lukker veiviseren', async () => {
    await render(
      <SessionProvider value={{ userId: 'me', email: 'admin@example.test' }}>
        <NavigationContainer ref={ref}>
          <Stack.Navigator>
            <Stack.Screen name="Home" component={HomeStub} />
            <Stack.Screen name="CreateGame" component={CreateGame} />
          </Stack.Navigator>
        </NavigationContainer>
      </SessionProvider>,
    );
    await act(async () => {
      ref.navigate('CreateGame');
    });

    await fireEvent.press(await screen.findByTestId('create-format-stableford'));
    await fireEvent.press(screen.getByTestId('create-next'));
    await fireEvent.changeText(screen.getByTestId('create-name'), 'Torsdagsrunden');
    await fireEvent.press(screen.getByTestId('create-next'));
    expect(screen.queryByTestId('create-step-setup')).toBeNull();

    // Steg 3 → steg 2: navigatoren står, og navnet er der.
    await pressBack();
    expect(wizardIsOpen()).toBe(true);
    expect(screen.getByTestId('create-step-setup')).toBeTruthy();
    expect(screen.getByTestId('create-name').props.value).toBe('Torsdagsrunden');

    // Steg 2 → steg 1: formatet er fortsatt valgt.
    await pressBack();
    expect(wizardIsOpen()).toBe(true);
    expect(screen.getByTestId('create-format-stableford').props.accessibilityState).toMatchObject({
      selected: true,
    });

    // Steg 1: ingen sperre, så skjermen forsvinner.
    await pressBack();
    expect(wizardIsOpen()).toBe(false);
    expect(ref.getRootState()?.routes.map((route) => route.name)).toEqual(['Home']);
  });
});
