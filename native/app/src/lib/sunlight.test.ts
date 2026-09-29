// #2252: sollys-valget på telefonen (Type A). Lageret i AsyncStorage er
// pakkens egen jest-mock, et lager i minnet.
/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock-factories heises over importene og må bruke require */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, renderHook } from '@testing-library/react-native';
import {
  SUNLIGHT_STORAGE_KEY,
  getSunlight,
  loadSunlight,
  setSunlight,
  useSunlight,
} from './sunlight';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest'),
);

describe('sunlight', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    await loadSunlight();
  });

  it.each([
    ['1', true],
    ['0', false],
    ['true', false],
  ])('leser %p som %p', async (stored, expected) => {
    await AsyncStorage.setItem(SUNLIGHT_STORAGE_KEY, stored);
    expect(await loadSunlight()).toBe(expected);
    expect(getSunlight()).toBe(expected);
  });

  it('er av når nøkkelen mangler', async () => {
    expect(await loadSunlight()).toBe(false);
  });

  it('skriver «1» når den slås på, og fjerner nøkkelen når den slås av', async () => {
    setSunlight(true);
    await act(async () => undefined);
    expect(await AsyncStorage.getItem(SUNLIGHT_STORAGE_KEY)).toBe('1');

    setSunlight(false);
    await act(async () => undefined);
    expect(await AsyncStorage.getItem(SUNLIGHT_STORAGE_KEY)).toBeNull();
  });

  it('er av og kaster ikke når lesingen feiler', async () => {
    setSunlight(true);
    jest.spyOn(AsyncStorage, 'getItem').mockRejectedValueOnce(new Error('disk'));
    await expect(loadSunlight()).resolves.toBe(false);
    expect(getSunlight()).toBe(false);
  });

  it('kaster ikke når skrivingen feiler', async () => {
    jest.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(new Error('disk'));
    expect(() => setSunlight(true)).not.toThrow();
    await act(async () => undefined);
    // Skjermen følger valget selv om det ikke ble lagret.
    expect(getSunlight()).toBe(true);
  });

  it('varsler alle som leser, med én gang', async () => {
    const a = await renderHook(() => useSunlight());
    const b = await renderHook(() => useSunlight());
    expect(a.result.current).toBe(false);

    await act(async () => setSunlight(true));
    expect(a.result.current).toBe(true);
    expect(b.result.current).toBe(true);

    await act(async () => setSunlight(false));
    expect(a.result.current).toBe(false);
  });
});
