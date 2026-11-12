// #2841: lageret for låsen og svaret fra telefonen (Type A). Lageret i
// AsyncStorage er pakkens egen jest-mock, et lager i minnet.
/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock-factories heises over importene og må bruke require */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, renderHook } from '@testing-library/react-native';
import {
  authenticateAsync,
  hasHardwareAsync,
  isEnrolledAsync,
  supportedAuthenticationTypesAsync,
} from 'expo-local-authentication';
import {
  APP_LOCK_STORAGE_KEY,
  answerFromResult,
  askForUnlock,
  getAppLock,
  loadAppLock,
  readAppLockSupport,
  setAppLock,
  useAppLock,
} from './appLock';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest'),
);
jest.mock('expo-local-authentication', () => require('../test/localAuthMock').localAuthMock());

describe('appLock', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
    await loadAppLock();
  });

  it.each([
    ['1', true],
    ['0', false],
    ['true', false],
  ])('leser %p som %p', async (stored, expected) => {
    await AsyncStorage.setItem(APP_LOCK_STORAGE_KEY, stored);
    expect(await loadAppLock()).toBe(expected);
    expect(getAppLock()).toBe(expected);
  });

  it('er av når nøkkelen mangler', async () => {
    expect(await loadAppLock()).toBe(false);
  });

  it('skriver «1» når den slås på, og fjerner nøkkelen når den slås av', async () => {
    setAppLock(true);
    await act(async () => undefined);
    expect(await AsyncStorage.getItem(APP_LOCK_STORAGE_KEY)).toBe('1');

    setAppLock(false);
    await act(async () => undefined);
    expect(await AsyncStorage.getItem(APP_LOCK_STORAGE_KEY)).toBeNull();
  });

  it('er av og kaster ikke når lesingen feiler', async () => {
    setAppLock(true);
    jest.spyOn(AsyncStorage, 'getItem').mockRejectedValueOnce(new Error('disk'));
    expect(await loadAppLock()).toBe(false);
  });

  it('kaster ikke når skrivingen feiler, og verdien i minnet står', async () => {
    jest.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(new Error('disk full'));
    setAppLock(true);
    await act(async () => undefined);
    expect(getAppLock()).toBe(true);
  });

  it('gir en ny render når valget endres', async () => {
    const { result } = await renderHook(() => useAppLock());
    expect(result.current).toBe(false);
    await act(async () => setAppLock(true));
    expect(result.current).toBe(true);
  });
});

describe('answerFromResult', () => {
  it('slipper inn ved suksess', () => {
    expect(answerFromResult({ success: true })).toBe('success');
  });

  it.each(['not_enrolled', 'passcode_not_set', 'not_available'] as const)(
    'slipper inn når telefonen ikke har noe å spørre med (%s)',
    (error) => {
      expect(answerFromResult({ success: false, error })).toBe('unavailable');
    },
  );

  it.each([
    'user_cancel',
    'system_cancel',
    'app_cancel',
    'lockout',
    'authentication_failed',
    'user_fallback',
    'timeout',
  ] as const)('holder låst ved %s', (error) => {
    expect(answerFromResult({ success: false, error })).toBe('denied');
  });
});

describe('askForUnlock', () => {
  it('spør med teksten og lar telefonens kode være reserveveien', async () => {
    expect(await askForUnlock()).toBe('success');
    expect(authenticateAsync).toHaveBeenCalledWith({
      promptMessage: 'Lås opp Tørny',
      cancelLabel: 'Avbryt',
      disableDeviceFallback: false,
    });
  });

  it('gir denied når spilleren avbryter', async () => {
    jest.mocked(authenticateAsync).mockResolvedValueOnce({ success: false, error: 'user_cancel' });
    expect(await askForUnlock()).toBe('denied');
  });

  it('slipper inn når det native laget kaster', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    jest.mocked(authenticateAsync).mockRejectedValueOnce(new Error('native'));
    expect(await askForUnlock()).toBe('unavailable');
  });
});

describe('readAppLockSupport', () => {
  it('gir typene og om noe er registrert', async () => {
    jest.mocked(supportedAuthenticationTypesAsync).mockResolvedValueOnce([2]);
    expect(await readAppLockSupport()).toEqual({ types: [2], enrolled: true });
  });

  it('gir enrolled false når ingenting er registrert', async () => {
    jest.mocked(isEnrolledAsync).mockResolvedValueOnce(false);
    expect(await readAppLockSupport()).toEqual({ types: [2], enrolled: false });
  });

  it('gir null uten maskinvare', async () => {
    jest.mocked(hasHardwareAsync).mockResolvedValueOnce(false);
    expect(await readAppLockSupport()).toBeNull();
  });

  it('gir null og kaster ikke når telefonen ikke svarer', async () => {
    jest.mocked(hasHardwareAsync).mockRejectedValueOnce(new Error('native'));
    expect(await readAppLockSupport()).toBeNull();
  });
});
