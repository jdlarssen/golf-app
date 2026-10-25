import { afterEach, describe, expect, it } from 'vitest';
import {
  isAndroid,
  isIos,
  isIosNonSafari,
  isIosSafari,
  isIpad,
  storePlatform,
} from './detect';
import {
  resetLaunchAndDevice,
  setDevice,
  type Device,
} from '@/lib/app/__tests__/_helpers';

afterEach(resetLaunchAndDevice);

describe('storePlatform', () => {
  it.each<[string, Device, number, string]>([
    ['iPhone', 'iphone', 5, 'ios'],
    ['iPad with an iPad user agent', 'ipad', 5, 'ios'],
    ['iPad with a Mac user agent', 'mac', 5, 'ios'],
    ['a real Mac', 'mac', 0, 'other'],
    ['Android', 'android', 5, 'android'],
    ['Windows', 'pc', 0, 'other'],
  ])('%s → %s', (_name, device, touch, expected) => {
    setDevice(device, touch);
    expect(storePlatform()).toBe(expected);
  });
});

describe('isIos / isIosSafari / isIosNonSafari (#2352)', () => {
  it.each<[string, Device, number, boolean, boolean, boolean]>([
    ['iPhone', 'iphone', 5, true, true, false],
    ['iPad with an iPad user agent', 'ipad', 5, true, true, false],
    ['iPad with a Mac user agent', 'mac', 5, true, true, false],
    ['a real Mac', 'mac', 0, false, false, false],
    ['Android', 'android', 5, false, false, false],
    ['Windows', 'pc', 0, false, false, false],
  ])('%s', (_name, device, touch, ios, safari, nonSafari) => {
    setDevice(device, touch);
    expect(isIos()).toBe(ios);
    expect(isIosSafari()).toBe(safari);
    expect(isIosNonSafari()).toBe(nonSafari);
  });
});

describe('isIpad (#2352)', () => {
  it.each<[string, Device, number, boolean]>([
    ['iPhone', 'iphone', 5, false],
    ['iPad with an iPad user agent', 'ipad', 5, true],
    ['iPad with a Mac user agent', 'mac', 5, true],
    ['a real Mac', 'mac', 0, false],
    ['Android', 'android', 5, false],
  ])('%s → %s', (_name, device, touch, expected) => {
    setDevice(device, touch);
    expect(isIpad()).toBe(expected);
  });
});

describe('isAndroid', () => {
  it('is true for an Android phone and false for an iPhone', () => {
    setDevice('android');
    expect(isAndroid()).toBe(true);
    setDevice('iphone');
    expect(isAndroid()).toBe(false);
  });
});
