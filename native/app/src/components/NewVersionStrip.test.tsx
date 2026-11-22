// native/app/src/components/NewVersionStrip.test.tsx
// Native #2975: Type C. Det en render kan bevise om stripa «Ny versjon er
// klar.»: den kommer når serveren har et nyere bygg, ✕ skjuler den for det
// bygget og lagrer valget, et enda nyere bygg viser den igjen, nettfeil gir
// ingen stripe, «Oppdater» åpner riktig sted, og appen under får toppinnfellingen
// uten statuslinja uten å monteres på nytt. Sammenligningen er Type A i
// `lib/newVersion.test.ts`.
/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock-fabrikkene heises over importene og må bruke require */
import { useEffect } from 'react';
import { Text, useWindowDimensions } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Linking } from 'react-native';
import { GOOGLE_PLAY_MARKET_URL, GOOGLE_PLAY_URL, TESTFLIGHT_APP_URL } from '@/lib/app/storeLinks';
import { fetchMinVersionBody } from '../data/updateCheck';
import { fireForeground } from '../test/syncTriggersMock';
import { readAppBuild } from '../lib/appBuild';
import { NEW_VERSION_DISMISSED_KEY } from '../lib/newVersion';
import { NEW_VERSION_TEXT } from '../lib/newVersionCopy';
import { NewVersionStrip, NewVersionTop, STACK_FONT_SCALE } from './NewVersionStrip';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest'),
);
jest.mock('../data/updateCheck', () => ({ fetchMinVersionBody: jest.fn() }));
jest.mock('../data/syncTriggers', () => require('../test/syncTriggersMock'));
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: jest.fn(() => ({ width: 390, height: 844, scale: 3, fontScale: 1 })),
}));
jest.mock('../lib/appBuild', () => ({
  ...jest.requireActual('../lib/appBuild'),
  readAppBuild: jest.fn(),
}));

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, right: 0, bottom: 34, left: 0 },
};

function serverSays(latest: number | null) {
  (fetchMinVersionBody as jest.Mock).mockResolvedValue(
    latest === null
      ? null
      : {
          ios: { minBuild: 1, latestBuild: latest },
          android: { minVersionCode: 1, latestVersionCode: latest },
        },
  );
}

function running(platform: 'ios' | 'android', build: number | null) {
  (readAppBuild as jest.Mock).mockReturnValue({ platform, version: '1.2.0', build });
}

const onMount = jest.fn();

/** Står for appen under stripa: viser toppinnfellingen og melder hver montering. */
function AppBelow() {
  const insets = useSafeAreaInsets();
  useEffect(() => onMount(), []);
  return <Text testID="app-below">{`top=${insets.top}`}</Text>;
}

async function renderTop() {
  await render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <NewVersionTop>
        <AppBelow />
      </NewVersionTop>
    </SafeAreaProvider>,
  );
}

let openUrl: jest.SpyInstance;

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  openUrl = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
});

afterEach(() => {
  openUrl.mockRestore();
});

describe('NewVersionTop', () => {
  it('viser stripa når et nyere bygg er ute, og gir appen under toppinnfelling 0', async () => {
    running('ios', 14);
    serverSays(15);
    await renderTop();

    expect(await screen.findByText(NEW_VERSION_TEXT.message)).toBeTruthy();
    expect(screen.getByRole('button', { name: NEW_VERSION_TEXT.update })).toBeTruthy();
    expect(screen.getByRole('button', { name: NEW_VERSION_TEXT.dismiss })).toBeTruthy();
    expect(screen.getByTestId('app-below')).toHaveTextContent('top=0');
    // Stripa tar statuslinja selv.
    expect(screen.getByTestId('new-version-strip')).toHaveStyle({ paddingTop: 47 });
    // Appen under ble ikke montert på nytt da stripa kom.
    expect(onMount).toHaveBeenCalledTimes(1);
  });

  it('viser ingenting når bygget er det nyeste', async () => {
    running('ios', 15);
    serverSays(15);
    await renderTop();

    await waitFor(() => expect(fetchMinVersionBody).toHaveBeenCalled());
    expect(screen.queryByTestId('new-version-strip')).toBeNull();
    expect(screen.getByTestId('app-below')).toHaveTextContent('top=47');
  });

  it('viser ingenting ved nettfeil, og stripa kommer ved neste forgrunn med svar', async () => {
    running('ios', 14);
    serverSays(null);
    await renderTop();
    await waitFor(() => expect(fetchMinVersionBody).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId('new-version-strip')).toBeNull();

    serverSays(15);
    fireForeground();

    expect(await screen.findByTestId('new-version-strip')).toBeTruthy();
  });

  it('står igjen når et senere kall feiler', async () => {
    running('ios', 14);
    serverSays(15);
    await renderTop();
    await screen.findByTestId('new-version-strip');

    serverSays(null);
    fireForeground();
    await waitFor(() => expect(fetchMinVersionBody).toHaveBeenCalledTimes(2));

    expect(screen.getByTestId('new-version-strip')).toBeTruthy();
  });

  it('viser ingenting når byggnummeret er ukjent (dev), og spør ikke serveren', async () => {
    running('ios', null);
    serverSays(15);
    await renderTop();

    expect(screen.queryByTestId('new-version-strip')).toBeNull();
    expect(fetchMinVersionBody).not.toHaveBeenCalled();
  });

  it('✕ skjuler stripa, lagrer bygget og gir appen statuslinja tilbake', async () => {
    running('ios', 14);
    serverSays(15);
    await renderTop();
    await screen.findByTestId('new-version-strip');

    fireEvent.press(screen.getByRole('button', { name: NEW_VERSION_TEXT.dismiss }));

    await waitFor(() => expect(screen.queryByTestId('new-version-strip')).toBeNull());
    expect(screen.getByTestId('app-below')).toHaveTextContent('top=47');
    expect(await AsyncStorage.getItem(NEW_VERSION_DISMISSED_KEY)).toBe('15');
    expect(onMount).toHaveBeenCalledTimes(1);
  });

  it('holder stripa skjult for det lukkede bygget, men viser den for et nyere', async () => {
    running('ios', 14);
    await AsyncStorage.setItem(NEW_VERSION_DISMISSED_KEY, '15');
    serverSays(15);
    await renderTop();
    await waitFor(() => expect(fetchMinVersionBody).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId('new-version-strip')).toBeNull();

    serverSays(16);
    fireForeground();

    expect(await screen.findByTestId('new-version-strip')).toBeTruthy();
  });

  it('«Oppdater» åpner TestFlight på iOS, og stripa står til bygget er nytt', async () => {
    running('ios', 14);
    serverSays(15);
    await renderTop();
    await screen.findByTestId('new-version-strip');

    fireEvent.press(screen.getByRole('button', { name: NEW_VERSION_TEXT.update }));

    await waitFor(() => expect(openUrl).toHaveBeenCalledWith(TESTFLIGHT_APP_URL));
    expect(screen.getByTestId('new-version-strip')).toBeTruthy();
  });

  it('«Oppdater» åpner Play-appen på Android, og nettsiden hvis market:// ikke finnes', async () => {
    running('android', 14);
    serverSays(15);
    openUrl.mockRejectedValueOnce(new Error('ingen handler'));
    await renderTop();
    await screen.findByTestId('new-version-strip');

    fireEvent.press(screen.getByRole('button', { name: NEW_VERSION_TEXT.update }));

    await waitFor(() => expect(openUrl).toHaveBeenCalledTimes(2));
    expect(openUrl).toHaveBeenNthCalledWith(1, GOOGLE_PLAY_MARKET_URL);
    expect(openUrl).toHaveBeenNthCalledWith(2, GOOGLE_PLAY_URL);
  });
});

describe('NewVersionStrip med stor tekst', () => {
  function textScale(fontScale: number) {
    (useWindowDimensions as jest.Mock).mockReturnValue({ width: 390, height: 844, scale: 3, fontScale });
  }

  afterEach(() => textScale(1));

  it('står på én linje med vanlig tekst', async () => {
    textScale(1);
    await render(<NewVersionStrip topInset={0} onUpdate={jest.fn()} onDismiss={jest.fn()} />);
    expect(screen.getByTestId('new-version-row')).toHaveStyle({ flexDirection: 'row' });
  });

  it('legger knappene under teksten fra STACK_FONT_SCALE', async () => {
    textScale(STACK_FONT_SCALE);
    await render(<NewVersionStrip topInset={0} onUpdate={jest.fn()} onDismiss={jest.fn()} />);
    expect(screen.getByTestId('new-version-row')).not.toHaveStyle({ flexDirection: 'row' });
    // Knappene er fortsatt der og like store.
    expect(screen.getByRole('button', { name: NEW_VERSION_TEXT.update })).toHaveStyle({ minHeight: 44 });
    expect(screen.getByRole('button', { name: NEW_VERSION_TEXT.dismiss })).toHaveStyle({
      minWidth: 44,
      minHeight: 44,
    });
  });
});
