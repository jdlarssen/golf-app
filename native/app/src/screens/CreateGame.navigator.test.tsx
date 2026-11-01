// native/app/src/screens/CreateGame.navigator.test.tsx
// #2746: veiviseren i en ekte navigator. Type C.
//
// `CreateGame.test.tsx` mocker `usePreventRemove`, så den kan ikke vise at
// sperra faktisk stanser navigatoren. Her er både hooken, ruteren og
// native-stack ekte. `goBack()` er det Androids tilbakeknapp sender. Pila gir en
// `pop`, som sperra fanger på samme måte, og den er kjørt her med `StackActions`.
// Selve trykket, og sveipet på iPhone, kan ikke kjøres i jest og står i
// tapptesten.
/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock-factories heises over importene og må bruke require */
import {
  NavigationContainer,
  StackActions,
  createNavigationContainerRef,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { View } from 'react-native';
import { publishGame } from '../data/createGame';
import type { RootStackParamList } from '../navigation';
import { SessionProvider } from '../session';
import { CreateGame } from './CreateGame';

jest.mock('../supabase', () => require('../test/supabaseMock'));
jest.mock('../data/syncTriggers', () => ({
  ...require('../test/syncTriggersMock'),
  isDeviceOnline: () => true,
}));
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
  fetchCourses: jest.fn(async () => [
    {
      id: 'course-1',
      name: 'Losby Golfklubb',
      tees: [{ id: 'tee-1', name: 'Gul', hasMens: true, hasLadies: true, hasJuniors: true }],
    },
  ]),
  fetchRosterCandidates: jest.fn(async () => [
    {
      id: 'p2',
      name: 'Ada Aas',
      nickname: null,
      hcpIndex: 8.1,
      gender: 'ladies',
      level: 'normal',
      pending: false,
    },
  ]),
  publishGame: jest.fn(),
  newGameId: jest.fn(() => 'wizard-game-id'),
}));

const Stack = createNativeStackNavigator<RootStackParamList>();
const ref = createNavigationContainerRef<RootStackParamList>();

const HomeStub = () => <View testID="home-stub" />;
const GameStub = () => <View testID="game-stub" />;

const wizardIsOpen = () => ref.getRootState()?.routes.at(-1)?.name === 'CreateGame';

async function pressBack() {
  await act(async () => {
    ref.goBack();
  });
}

async function openWizard() {
  await render(
    <SessionProvider value={{ userId: 'me', email: 'admin@example.test' }}>
      <NavigationContainer ref={ref}>
        <Stack.Navigator>
          <Stack.Screen name="Home" component={HomeStub} />
          <Stack.Screen name="CreateGame" component={CreateGame} />
          <Stack.Screen name="GameHome" component={GameStub} />
        </Stack.Navigator>
      </NavigationContainer>
    </SessionProvider>,
  );
  await act(async () => {
    ref.navigate('CreateGame');
  });
}

describe('CreateGame i en ekte navigator (#2746)', () => {
  it('«Opprett» slipper gjennom sperra: spillet erstatter veiviseren', async () => {
    (publishGame as jest.Mock).mockResolvedValueOnce({ ok: true, gameId: 'new-game-1' });
    await openWizard();

    await fireEvent.press(await screen.findByTestId('create-format-stableford'));
    await fireEvent.press(screen.getByTestId('create-next'));
    await fireEvent.press(screen.getByTestId('create-next'));
    await fireEvent.press(await screen.findByTestId('create-course-course-1'));
    await fireEvent.press(screen.getByTestId('create-tee-tee-1'));
    await fireEvent.press(screen.getByTestId('create-next'));
    await fireEvent.press(screen.getByTestId('create-player-p2'));
    await fireEvent.press(screen.getByTestId('create-next'));
    await fireEvent.press(screen.getByTestId('create-publish'));

    expect(ref.getRootState()?.routes.map((route) => route.name)).toEqual(['Home', 'GameHome']);
    expect(ref.getRootState()?.routes[1]?.params).toEqual({ gameId: 'new-game-1' });
  });

  it('pila (`pop`) går ett steg, som Android-tilbake', async () => {
    await openWizard();
    await fireEvent.press(await screen.findByTestId('create-format-stableford'));
    await fireEvent.press(screen.getByTestId('create-next'));
    await act(async () => {
      ref.dispatch(StackActions.pop());
    });
    expect(wizardIsOpen()).toBe(true);
    expect(screen.queryByTestId('create-step-setup')).toBeNull();
    expect(screen.getByTestId('create-format-stableford')).toBeTruthy();
  });

  it('tilbake går ett steg med valgene beholdt, og første steg lukker veiviseren', async () => {
    await openWizard();

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
