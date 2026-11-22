// native/app/src/components/AppLockGate.test.tsx
// #2841: porten for låsen (Type C). Hva telefonen svarer er Type A i
// `lib/appLock.test.ts`; her sjekkes det en render kan bekrefte: at ingenting
// under porten monteres før telefonen har sagt ja, at «Lås opp» spør på nytt,
// og at dekket i appvelgeren kommer og går med `AppState` uten å røre barna.
// #2975: arket «Versjon … er klar» står innenfor porten, som i `App.tsx`, og
// legger seg aldri over låseskjermen.
/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock-fabrikkene heises over importene og må bruke require */
import { useEffect, useState } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { AppState, Text, type AppStateStatus } from 'react-native';
import { authenticateAsync } from 'expo-local-authentication';
import * as SplashScreen from 'expo-splash-screen';
import { loadAppLock, setAppLock } from '../lib/appLock';
import { setRecentsScreenshotEnabled } from '../lib/recentsScreenshot';
import { fetchMinVersionBody } from '../data/updateCheck';
import { readAppBuild } from '../lib/appBuild';
import { NewVersionProvider } from '../lib/useNewVersion';
import { NewVersionSheet } from './newVersion/NewVersionSheet';
import { AppLockGate } from './AppLockGate';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest'),
);
jest.mock('expo-local-authentication', () => require('../test/localAuthMock').localAuthMock());
jest.mock('expo-splash-screen', () => ({ hideAsync: jest.fn().mockResolvedValue(true) }));
jest.mock('react-native-safe-area-context', () => require('../test/safeAreaMock').safeAreaMock());
jest.mock('../lib/recentsScreenshot', () => ({ setRecentsScreenshotEnabled: jest.fn() }));
jest.mock('../data/updateCheck', () => ({ fetchMinVersionBody: jest.fn(async () => null) }));
jest.mock('../data/syncTriggers', () => require('../test/syncTriggersMock'));
jest.mock('../lib/appBuild', () => ({
  ...jest.requireActual('../lib/appBuild'),
  readAppBuild: jest.fn(() => ({ platform: 'ios', version: '1.2.0', build: null })),
}));

const authenticate = authenticateAsync as jest.Mock;
let handlers: Array<(state: AppStateStatus) => void> = [];
let mounts = 0;

function Probe() {
  useEffect(() => {
    mounts += 1;
  }, []);
  return <Text testID="app-stack">Appen</Text>;
}

/** Som `ReadyApp` i `App.tsx`: porten nullstilles når telefonen har sagt ja. */
function Harness({
  initiallyLocked,
  onUnlocked,
  withSheet = false,
}: {
  initiallyLocked: boolean;
  onUnlocked?: () => void;
  /** Arket «Versjon … er klar» øverst blant barna, der `App.tsx` har det. */
  withSheet?: boolean;
}) {
  const [startLocked, setStartLocked] = useState(initiallyLocked);
  return (
    <AppLockGate
      startLocked={startLocked}
      onUnlocked={() => {
        onUnlocked?.();
        setStartLocked(false);
      }}
    >
      {withSheet ? <NewVersionSheet /> : null}
      <Probe />
    </AppLockGate>
  );
}

async function goTo(state: AppStateStatus) {
  await act(async () => {
    for (const handler of handlers) handler(state);
  });
}

describe('AppLockGate', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    authenticate.mockResolvedValue({ success: true });
    handlers = [];
    mounts = 0;
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, handler) => {
      handlers.push(handler as (state: AppStateStatus) => void);
      return { remove: jest.fn() };
    });
    setAppLock(false);
    await loadAppLock();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('er låsen av, monteres barna med en gang, uten spørsmål og uten dekke', async () => {
    await render(<Harness initiallyLocked={false} />);
    expect(screen.getByTestId('app-stack')).toBeTruthy();
    expect(screen.queryByTestId('app-lock-screen')).toBeNull();
    expect(authenticate).not.toHaveBeenCalled();
    await goTo('inactive');
    expect(screen.queryByTestId('app-lock-cover')).toBeNull();
  });

  it('spør ved kaldstart: barna finnes ikke før telefonen har sagt ja, og finnes etterpå', async () => {
    let answer: (value: { success: true }) => void = () => {};
    authenticate.mockReturnValueOnce(new Promise((resolve) => (answer = resolve)));
    const onUnlocked = jest.fn();
    await render(<Harness initiallyLocked onUnlocked={onUnlocked} />);

    await waitFor(() => expect(authenticate).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId('app-lock-screen')).toBeTruthy();
    expect(screen.queryByTestId('app-stack')).toBeNull();

    await act(async () => answer({ success: true }));
    await waitFor(() => expect(screen.getByTestId('app-stack')).toBeTruthy());
    expect(screen.queryByTestId('app-lock-screen')).toBeNull();
    expect(onUnlocked).toHaveBeenCalledTimes(1);
  });

  it('legger ikke arket «Versjon … er klar» over låseskjermen, men viser det etter ja (#2975)', async () => {
    (readAppBuild as jest.Mock).mockReturnValue({ platform: 'ios', version: '1.2.0', build: 14 });
    (fetchMinVersionBody as jest.Mock).mockResolvedValue({
      ios: { minBuild: 1, latestBuild: 15, latestVersion: '1.2.0', notes: [] },
    });
    let answer: (value: { success: true }) => void = () => {};
    authenticate.mockReturnValueOnce(new Promise((resolve) => (answer = resolve)));
    await render(
      <NewVersionProvider enabled>
        <Harness initiallyLocked withSheet />
      </NewVersionProvider>,
    );

    // Serveren har svart, og telefonen venter på Face ID: låseskjermen alene.
    await waitFor(() => expect(fetchMinVersionBody).toHaveBeenCalled());
    await waitFor(() => expect(authenticate).toHaveBeenCalledTimes(1));
    await act(async () => {});
    expect(screen.getByTestId('app-lock-screen')).toBeTruthy();
    expect(screen.getByTestId('app-lock-unlock')).toBeTruthy();
    expect(screen.queryByTestId('new-version-sheet')).toBeNull();

    await act(async () => answer({ success: true }));
    expect(await screen.findByTestId('new-version-sheet')).toBeTruthy();
    expect(screen.queryByTestId('app-lock-screen')).toBeNull();
  });

  it('slipper splashen før spørsmålet kommer', async () => {
    await render(<Harness initiallyLocked />);
    await waitFor(() => expect(authenticate).toHaveBeenCalled());
    const hide = (SplashScreen.hideAsync as jest.Mock).mock.invocationCallOrder[0];
    expect(hide).toBeLessThan(authenticate.mock.invocationCallOrder[0]);
  });

  it('avbryt gir låseskjermen, og «Lås opp» spør på nytt uten at noe spør av seg selv', async () => {
    authenticate.mockResolvedValueOnce({ success: false, error: 'user_cancel' });
    await render(<Harness initiallyLocked />);

    await waitFor(() => expect(screen.getByTestId('app-lock-unlock')).toBeTruthy());
    await act(async () => undefined);
    expect(authenticate).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('app-stack')).toBeNull();
    expect(screen.getByText('Lås opp')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('app-lock-unlock'));
    await waitFor(() => expect(screen.getByTestId('app-stack')).toBeTruthy());
    expect(authenticate).toHaveBeenCalledTimes(2);
  });

  it.each(['not_enrolled', 'passcode_not_set', 'not_available'] as const)(
    '%s slipper spilleren inn: telefonen har ingenting å spørre med',
    async (error) => {
      authenticate.mockResolvedValueOnce({ success: false, error });
      await render(<Harness initiallyLocked />);
      await waitFor(() => expect(screen.getByTestId('app-stack')).toBeTruthy());
    },
  );

  it.each(['lockout', 'authentication_failed'] as const)(
    '%s holder spilleren på låseskjermen',
    async (error) => {
      authenticate.mockResolvedValueOnce({ success: false, error });
      await render(<Harness initiallyLocked />);
      await waitFor(() => expect(screen.getByTestId('app-lock-unlock')).toBeTruthy());
      await act(async () => undefined);
      expect(screen.queryByTestId('app-stack')).toBeNull();
    },
  );

  it('med låsen på gir bakgrunn → aktiv ingen spørsmål, uansett tid, og barna står montert hele tiden', async () => {
    setAppLock(true);
    await render(<Harness initiallyLocked={false} />);
    jest.useFakeTimers();
    expect(mounts).toBe(1);

    await goTo('background');
    expect(screen.getByTestId('app-lock-cover')).toBeTruthy();
    // Barna er der, men skjult for skjermleseren.
    expect(screen.getByTestId('app-stack', { includeHiddenElements: true })).toBeTruthy();

    await act(async () => {
      jest.advanceTimersByTime(24 * 60 * 60 * 1000);
    });
    await goTo('active');

    expect(screen.queryByTestId('app-lock-cover')).toBeNull();
    expect(screen.queryByTestId('app-lock-screen')).toBeNull();
    expect(authenticate).not.toHaveBeenCalled();
    expect(mounts).toBe(1);
  });

  it('dekket kommer også ved inactive (appvelgeren, Face ID-dialogen) og går ved active', async () => {
    setAppLock(true);
    await render(<Harness initiallyLocked={false} />);

    await goTo('inactive');
    expect(screen.getByTestId('app-lock-cover')).toBeTruthy();
    expect(authenticate).not.toHaveBeenCalled();

    await goTo('active');
    expect(screen.queryByTestId('app-lock-cover')).toBeNull();
    expect(mounts).toBe(1);
  });

  it('ber Android la være å ta appvelger-bilde mens låsen er på, og slår det på igjen når den slås av eller porten forsvinner', async () => {
    const recents = setRecentsScreenshotEnabled as jest.Mock;
    const view = await render(<Harness initiallyLocked={false} />);
    expect(recents).toHaveBeenLastCalledWith(true);

    await act(async () => setAppLock(true));
    expect(recents).toHaveBeenLastCalledWith(false);

    recents.mockClear();
    await goTo('active');
    expect(recents).toHaveBeenCalledWith(false);

    await act(async () => setAppLock(false));
    expect(recents).toHaveBeenLastCalledWith(true);

    await act(async () => setAppLock(true));
    await view.unmount();
    expect(recents).toHaveBeenLastCalledWith(true);
  });

  it('holder appvelger-bildet av også mens låseskjermen står', async () => {
    setAppLock(true);
    await render(<Harness initiallyLocked />);
    expect(setRecentsScreenshotEnabled).toHaveBeenLastCalledWith(false);
  });

  it('dekket kommer og går når låsen slås på og av mens appen står åpen', async () => {
    await render(<Harness initiallyLocked={false} />);
    await goTo('inactive');
    expect(screen.queryByTestId('app-lock-cover')).toBeNull();

    await act(async () => setAppLock(true));
    expect(screen.getByTestId('app-lock-cover')).toBeTruthy();
    await act(async () => setAppLock(false));
    expect(screen.queryByTestId('app-lock-cover')).toBeNull();
  });
});
