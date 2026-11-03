// #2758: kortet på Hjem. Kjører den ekte `pushPrompt` og `pushDevice` mot en mock
// av varselpakken, så testen ser hva telefonen faktisk blir bedt om: spørsmålet
// kommer bare etter trykk, og svaret står også etter omstart.
/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock-factories heises over importene */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { AccessibilityInfo, Platform, StyleSheet } from 'react-native';
import { PUSH_PROMPT_ANSWERED_KEY } from '../data/pushPrompt';
import { PROFILE_TEXT } from '../lib/profileCopy';
import { PushPromptCard } from './PushPromptCard';

const mockNotifications = {
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  getDevicePushTokenAsync: jest.fn(),
  setNotificationChannelAsync: jest.fn(),
  AndroidImportance: { HIGH: 4 },
};
jest.mock('expo-notifications', () => mockNotifications);
jest.mock('expo', () => ({ requireOptionalNativeModule: () => ({}) }));
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest'),
);
jest.mock('../supabase', () => require('../test/supabaseMock'));
// Fokus er det testen styrer: hver montering er ett fokus, `refocus` er det neste.
let mockRefocus: (() => void) | null = null;
jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (effect: () => void | (() => void)) => {
    const { useEffect: useMockEffect, useState: useMockState } = require('react');
    const [tick, setTick] = useMockState(0);
    useMockEffect(() => {
      mockRefocus = () => setTick((n: number) => n + 1);
    }, []);
    useMockEffect(effect, [tick, effect]);
  },
}));

type Mocks = typeof import('../test/supabaseMock');
const mocks = () => require('../test/supabaseMock') as Mocks;

const NEVER_ASKED = { granted: false, canAskAgain: true, status: 'undetermined' };
const GRANTED = { granted: true, canAskAgain: true, status: 'granted' };

/** Rendrer kortet og venter ut lesingen av svaret og tillatelsen. */
async function open(roundInProgress = false) {
  await render(<PushPromptCard roundInProgress={roundInProgress} />);
  await act(async () => {
    await new Promise((resolve) => setImmediate(resolve));
  });
}

describe('PushPromptCard', () => {
  let announce: jest.SpyInstance;

  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.replaceProperty(Platform, 'OS', 'ios');
    announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
    mockNotifications.getPermissionsAsync.mockReset().mockResolvedValue(NEVER_ASKED);
    mockNotifications.requestPermissionsAsync.mockReset().mockResolvedValue({ granted: true, canAskAgain: true });
    mockNotifications.getDevicePushTokenAsync.mockReset().mockResolvedValue({ type: 'ios', data: 'tokenet' });
    mocks().currentDeviceUserId.mockResolvedValue('user-me');
    mocks().routeFrom({ apns_tokens: [mocks().queryStub({ data: [{ id: 'row-1' }], error: null })] });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('viser kortet, uten at telefonens spørsmål kommer av seg selv', async () => {
    await open();

    expect(screen.getByTestId('push-prompt')).toHaveTextContent(PROFILE_TEXT.pushPromptTitle, { exact: false });
    expect(screen.getByTestId('push-prompt')).toHaveTextContent(PROFILE_TEXT.pushPromptBody, { exact: false });
    expect(mockNotifications.requestPermissionsAsync).not.toHaveBeenCalled();
  });

  it('ja: viser bekreftelsen, leser den opp, skriver raden, og er borte ved neste fokus', async () => {
    await open();

    await fireEvent.press(screen.getByRole('button', { name: PROFILE_TEXT.pushPromptEnable }));

    expect(mockNotifications.requestPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('push-prompt-done')).toHaveTextContent(PROFILE_TEXT.pushPromptDoneTitle, { exact: false });
    expect(announce).toHaveBeenCalledWith(`${PROFILE_TEXT.pushPromptDoneTitle}. ${PROFILE_TEXT.pushPromptDoneBody}`);
    expect(await AsyncStorage.getItem(PUSH_PROMPT_ANSWERED_KEY)).not.toBeNull();

    await act(async () => {
      mockRefocus?.();
      await new Promise((resolve) => setImmediate(resolve));
    });

    expect(screen.queryByTestId('push-prompt-done')).toBeNull();
    expect(screen.queryByTestId('push-prompt')).toBeNull();
  });

  it.each([
    ['et nei for godt', { granted: false, canAskAgain: false }],
    ['et nei som kan spørres om igjen', { granted: false, canAskAgain: true }],
  ])('%s fjerner kortet, også etter omstart', async (_case, answer) => {
    mockNotifications.requestPermissionsAsync.mockResolvedValue(answer);
    await open();

    await fireEvent.press(screen.getByRole('button', { name: PROFILE_TEXT.pushPromptEnable }));

    expect(screen.queryByTestId('push-prompt')).toBeNull();
    expect(screen.queryByTestId('push-prompt-done')).toBeNull();

    await screen.unmount();
    await open();
    expect(screen.queryByTestId('push-prompt')).toBeNull();
  });

  // Feilen kommer etter at spilleren har sagt ja, så telefonen svarer «gitt» når
  // kortet leses på nytt. På iPhone er det også svaret til en som har valgt.
  it.each(['ios', 'android'] as const)(
    'en feil på %s viser feilteksten, og kortet står ved neste fokus og etter omstart',
    async (os) => {
      jest.replaceProperty(Platform, 'OS', os);
      mockNotifications.requestPermissionsAsync.mockImplementation(async () => {
        mockNotifications.getPermissionsAsync.mockResolvedValue(GRANTED);
        return { granted: true, canAskAgain: true };
      });
      mockNotifications.getDevicePushTokenAsync.mockRejectedValue(new Error('ingen token'));
      await open();

      await fireEvent.press(screen.getByRole('button', { name: PROFILE_TEXT.pushPromptEnable }));

      expect(screen.getByTestId('push-prompt-error')).toHaveTextContent(PROFILE_TEXT.pushOnFailed);
      expect(announce).toHaveBeenCalledWith(PROFILE_TEXT.pushOnFailed);
      expect(screen.getByTestId('push-prompt')).toBeTruthy();

      await act(async () => {
        mockRefocus?.();
        await new Promise((resolve) => setImmediate(resolve));
      });
      expect(screen.getByTestId('push-prompt')).toBeTruthy();
      expect(screen.queryByTestId('push-prompt-error')).toBeNull();

      await screen.unmount();
      await open();
      expect(screen.getByTestId('push-prompt')).toBeTruthy();
    },
  );

  it('et nytt forsøk etter en feil lagrer svaret, så kortet ikke kommer igjen', async () => {
    mockNotifications.requestPermissionsAsync.mockImplementation(async () => {
      mockNotifications.getPermissionsAsync.mockResolvedValue(GRANTED);
      return { granted: true, canAskAgain: true };
    });
    mockNotifications.getDevicePushTokenAsync.mockRejectedValueOnce(new Error('ingen token'));
    await open();
    await fireEvent.press(screen.getByRole('button', { name: PROFILE_TEXT.pushPromptEnable }));

    await fireEvent.press(screen.getByRole('button', { name: PROFILE_TEXT.pushPromptEnable }));

    expect(screen.getByTestId('push-prompt-done')).toBeTruthy();
    expect(await AsyncStorage.getItem(PUSH_PROMPT_ANSWERED_KEY)).not.toBe('retry');
    await screen.unmount();
    await open();
    expect(screen.queryByTestId('push-prompt')).toBeNull();
    expect(screen.queryByTestId('push-prompt-done')).toBeNull();
  });

  it('«Ikke nå» etter en feil avslutter det, også etter omstart', async () => {
    mockNotifications.requestPermissionsAsync.mockImplementation(async () => {
      mockNotifications.getPermissionsAsync.mockResolvedValue(GRANTED);
      return { granted: true, canAskAgain: true };
    });
    mockNotifications.getDevicePushTokenAsync.mockRejectedValue(new Error('ingen token'));
    await open();
    await fireEvent.press(screen.getByRole('button', { name: PROFILE_TEXT.pushPromptEnable }));

    await fireEvent.press(screen.getByRole('button', { name: PROFILE_TEXT.pushPromptLater }));

    expect(screen.queryByTestId('push-prompt')).toBeNull();
    expect(await AsyncStorage.getItem(PUSH_PROMPT_ANSWERED_KEY)).not.toBe('retry');
    await screen.unmount();
    await open();
    expect(screen.queryByTestId('push-prompt')).toBeNull();
  });

  it('«Ikke nå» fjerner kortet for godt, og sparer telefonens spørsmål', async () => {
    await open();

    await fireEvent.press(screen.getByRole('button', { name: PROFILE_TEXT.pushPromptLater }));

    expect(screen.queryByTestId('push-prompt')).toBeNull();
    expect(mockNotifications.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(await AsyncStorage.getItem(PUSH_PROMPT_ANSWERED_KEY)).not.toBeNull();

    await screen.unmount();
    await open();
    expect(screen.queryByTestId('push-prompt')).toBeNull();
  });

  it('vises ikke mens en runde pågår', async () => {
    await open(true);

    expect(screen.queryByTestId('push-prompt')).toBeNull();
    expect(mockNotifications.requestPermissionsAsync).not.toHaveBeenCalled();
  });

  it('knappene har navn og er minst 44 pt høye', async () => {
    await open();

    for (const name of [PROFILE_TEXT.pushPromptEnable, PROFILE_TEXT.pushPromptLater]) {
      const button = screen.getByRole('button', { name });
      expect(StyleSheet.flatten(button.props.style).minHeight).toBeGreaterThanOrEqual(44);
    }
  });
});
