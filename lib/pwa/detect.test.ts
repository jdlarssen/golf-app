import { afterEach, describe, expect, it, vi } from 'vitest';
import { isAndroid, storePlatform } from './detect';

const UA = {
  iphone:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  ipadOld:
    'Mozilla/5.0 (iPad; CPU OS 12_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/12.1 Mobile/15E148 Safari/604.1',
  // iPadOS 13+ Safari: a Mac user agent; only the touch points give it away.
  mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
  android:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36',
  windows:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
};

// jsdom has no `maxTouchPoints`, so it is defined per test and removed after.
function device(userAgent: string, maxTouchPoints = 0) {
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(userAgent);
  Object.defineProperty(navigator, 'maxTouchPoints', {
    configurable: true,
    get: () => maxTouchPoints,
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  delete (navigator as { maxTouchPoints?: number }).maxTouchPoints;
});

describe('storePlatform', () => {
  it.each([
    ['iPhone', UA.iphone, 5, 'ios'],
    ['iPad with an iPad user agent', UA.ipadOld, 5, 'ios'],
    ['iPad with a Mac user agent', UA.mac, 5, 'ios'],
    ['a real Mac', UA.mac, 0, 'other'],
    ['Android', UA.android, 5, 'android'],
    ['Windows', UA.windows, 0, 'other'],
  ] as const)('%s → %s', (_name, ua, touch, expected) => {
    device(ua, touch);
    expect(storePlatform()).toBe(expected);
  });
});

describe('isAndroid', () => {
  it('is true for an Android phone and false for an iPhone', () => {
    device(UA.android, 5);
    expect(isAndroid()).toBe(true);
    device(UA.iphone, 5);
    expect(isAndroid()).toBe(false);
  });
});
