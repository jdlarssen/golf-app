// native/app/src/components/newVersion/NewVersionSheet.test.tsx
// Native #2975: Type C. Det en render kan bevise om arket «Versjon … er klar» og
// leverandøren bak det: arket kommer når serveren har et nyere bygg, med tittel
// og punkter (og uten punkter når serveren ikke har noen); «Senere», hinnen og
// «Oppdater» lukker det for bygget og lagrer valget, og påminnelsen tar over;
// et enda nyere bygg viser arket igjen; nettfeil og ukjent bygg gir ingenting;
// «Oppdater» åpner riktig sted. Sammenligningen er Type A i
// `lib/newVersion.test.ts`.
/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock-fabrikkene heises over importene og må bruke require */
import { AccessibilityInfo, Linking, Text } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { GOOGLE_PLAY_MARKET_URL, GOOGLE_PLAY_URL, TESTFLIGHT_APP_URL } from '@/lib/app/storeLinks';
import { fetchMinVersionBody } from '../../data/updateCheck';
import { fireForeground } from '../../test/syncTriggersMock';
import { readAppBuild } from '../../lib/appBuild';
import { NEW_VERSION_SEEN_KEY } from '../../lib/newVersion';
import { NEW_VERSION_TEXT } from '../../lib/newVersionCopy';
import { NewVersionProvider, useNewVersion } from '../../lib/useNewVersion';
import { NewVersionSheet } from './NewVersionSheet';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest'),
);
jest.mock('react-native-safe-area-context', () => require('../../test/safeAreaMock').safeAreaMock());
jest.mock('../../data/updateCheck', () => ({ fetchMinVersionBody: jest.fn() }));
jest.mock('../../data/syncTriggers', () => require('../../test/syncTriggersMock'));
jest.mock('../../lib/appBuild', () => ({
  ...jest.requireActual('../../lib/appBuild'),
  readAppBuild: jest.fn(),
}));

const NOTES = ['Tavla oppdateres raskere', 'Du kan dele bag-taggen'];

function serverSays(latest: number | null, notes: string[] = NOTES) {
  (fetchMinVersionBody as jest.Mock).mockResolvedValue(
    latest === null
      ? null
      : {
          ios: { minBuild: 1, latestBuild: latest, latestVersion: '1.2.0', notes },
          android: { minVersionCode: 1, latestVersionCode: latest, latestVersion: '1.2.0', notes },
        },
  );
}

function running(platform: 'ios' | 'android', build: number | null) {
  (readAppBuild as jest.Mock).mockReturnValue({ platform, version: '1.2.0', build });
}

/** Står for prikken og raden: viser hva leverandøren sier. */
function Mode() {
  return <Text testID="mode">{useNewVersion().mode}</Text>;
}

async function renderApp() {
  await render(
    <NewVersionProvider enabled>
      <NewVersionSheet />
      <Mode />
    </NewVersionProvider>,
  );
}

let openUrl: jest.SpyInstance;

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  openUrl = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('NewVersionSheet', () => {
  it('viser arket med tittel, punktene og to knapper når et nyere bygg er ute', async () => {
    running('ios', 14);
    serverSays(15);
    await renderApp();

    expect(await screen.findByText('Versjon 1.2.0 (15) er klar')).toBeTruthy();
    expect(screen.getByRole('header', { name: 'Versjon 1.2.0 (15) er klar' })).toBeTruthy();
    expect(screen.getByText(NOTES[0])).toBeTruthy();
    expect(screen.getByText(NOTES[1])).toBeTruthy();
    expect(screen.getByRole('button', { name: NEW_VERSION_TEXT.update })).toHaveStyle({ minHeight: 48 });
    expect(screen.getByRole('button', { name: NEW_VERSION_TEXT.later })).toHaveStyle({ minHeight: 44 });
    expect(screen.getByTestId('mode')).toHaveTextContent('sheet');
  });

  it('viser arket uten liste når serveren ikke har nyheter', async () => {
    running('ios', 14);
    serverSays(15, []);
    await renderApp();

    await screen.findByTestId('new-version-sheet');
    expect(screen.queryByTestId('new-version-notes')).toBeNull();
  });

  it('viser ingenting når bygget er det nyeste', async () => {
    running('ios', 15);
    serverSays(15);
    await renderApp();

    await waitFor(() => expect(fetchMinVersionBody).toHaveBeenCalled());
    expect(screen.queryByTestId('new-version-sheet')).toBeNull();
    expect(screen.getByTestId('mode')).toHaveTextContent('none');
  });

  it('viser ingenting ved nettfeil, og arket kommer ved neste forgrunn med svar', async () => {
    running('ios', 14);
    serverSays(null);
    await renderApp();
    await waitFor(() => expect(fetchMinVersionBody).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId('new-version-sheet')).toBeNull();

    serverSays(15);
    fireForeground();

    expect(await screen.findByTestId('new-version-sheet')).toBeTruthy();
  });

  it('viser ingenting når byggnummeret er ukjent (dev), og spør ikke serveren', async () => {
    running('ios', null);
    serverSays(15);
    await renderApp();

    expect(screen.queryByTestId('new-version-sheet')).toBeNull();
    expect(fetchMinVersionBody).not.toHaveBeenCalled();
  });

  it('«Senere» lukker arket for bygget, lagrer det og gir påminnelsen', async () => {
    running('ios', 14);
    serverSays(15);
    await renderApp();
    await screen.findByTestId('new-version-sheet');

    await fireEvent.press(screen.getByRole('button', { name: NEW_VERSION_TEXT.later }));

    await waitFor(() => expect(screen.queryByTestId('new-version-sheet')).toBeNull());
    expect(screen.getByTestId('mode')).toHaveTextContent('reminder');
    expect(await AsyncStorage.getItem(NEW_VERSION_SEEN_KEY)).toBe('15');
    expect(openUrl).not.toHaveBeenCalled();
  });

  it('et trykk på hinnen er det samme som «Senere»', async () => {
    running('ios', 14);
    serverSays(15);
    await renderApp();
    await screen.findByTestId('new-version-sheet');

    await fireEvent.press(screen.getByTestId('new-version-scrim', { includeHiddenElements: true }));

    await waitFor(() => expect(screen.getByTestId('mode')).toHaveTextContent('reminder'));
  });

  it('holder arket borte for det sette bygget, men viser det for et nyere', async () => {
    running('ios', 14);
    await AsyncStorage.setItem(NEW_VERSION_SEEN_KEY, '15');
    serverSays(15);
    await renderApp();
    await waitFor(() => expect(screen.getByTestId('mode')).toHaveTextContent('reminder'));
    expect(screen.queryByTestId('new-version-sheet')).toBeNull();

    serverSays(16);
    fireForeground();

    expect(await screen.findByText('Versjon 1.2.0 (16) er klar')).toBeTruthy();
  });

  it('«Oppdater» åpner TestFlight på iOS og lukker arket for bygget', async () => {
    running('ios', 14);
    serverSays(15);
    await renderApp();
    await screen.findByTestId('new-version-sheet');

    await fireEvent.press(screen.getByRole('button', { name: NEW_VERSION_TEXT.update }));

    await waitFor(() => expect(openUrl).toHaveBeenCalledWith(TESTFLIGHT_APP_URL));
    expect(screen.getByTestId('mode')).toHaveTextContent('reminder');
    expect(await AsyncStorage.getItem(NEW_VERSION_SEEN_KEY)).toBe('15');
  });

  it('«Oppdater» åpner Play-appen på Android, og nettsiden hvis market:// ikke finnes', async () => {
    running('android', 14);
    serverSays(15);
    openUrl.mockRejectedValueOnce(new Error('ingen handler'));
    await renderApp();
    await screen.findByTestId('new-version-sheet');

    await fireEvent.press(screen.getByRole('button', { name: NEW_VERSION_TEXT.update }));

    await waitFor(() => expect(openUrl).toHaveBeenCalledTimes(2));
    expect(openUrl).toHaveBeenNthCalledWith(1, GOOGLE_PLAY_MARKET_URL);
    expect(openUrl).toHaveBeenNthCalledWith(2, GOOGLE_PLAY_URL);
  });

  it('glir opp, men ikke når «Reduser bevegelse» er på', async () => {
    running('ios', 14);
    serverSays(15);
    const first = await render(
      <NewVersionProvider enabled>
        <NewVersionSheet />
      </NewVersionProvider>,
    );
    await screen.findByTestId('new-version-sheet');
    expect(screen.getByTestId('new-version-modal').props.animationType).toBe('slide');
    await first.unmount();

    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
    running('ios', 14);
    serverSays(15);
    await renderApp();
    await screen.findByTestId('new-version-sheet');

    await waitFor(() =>
      expect(screen.getByTestId('new-version-modal').props.animationType).toBe('none'),
    );
  });
});
