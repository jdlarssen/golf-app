import { afterEach, describe, expect, it } from 'vitest';
import { isAndroid, storePlatform } from './detect';
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

describe('isAndroid', () => {
  it('is true for an Android phone and false for an iPhone', () => {
    setDevice('android');
    expect(isAndroid()).toBe(true);
    setDevice('iphone');
    expect(isAndroid()).toBe(false);
  });
});
