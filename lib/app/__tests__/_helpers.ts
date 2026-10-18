// Shared device and switch mocks for the «Hent appen» tests (#2562): the
// launch switch, a device's user agent and touch points, and the reset.
//
// Pattern per test file:
//
//   import { afterEach } from 'vitest';
//   import { resetLaunchAndDevice, setDevice, setLaunch } from '@/lib/app/__tests__/_helpers';
//
//   afterEach(resetLaunchAndDevice);
//
//   setLaunch('on');
//   setDevice('iphone');
import { vi } from 'vitest';

export const UA = {
  iphone:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  ipad:
    'Mozilla/5.0 (iPad; CPU OS 12_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/12.1 Mobile/15E148 Safari/604.1',
  // iPadOS 13+ Safari reports this too; only the touch points tell them apart.
  mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
  android:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36',
  pc: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
} as const;

export type Device = keyof typeof UA;

/** `NEXT_PUBLIC_APP_LAUNCH` for this test; `undefined` is the unset variable. */
export function setLaunch(flag: string | undefined): void {
  vi.stubEnv('NEXT_PUBLIC_APP_LAUNCH', flag);
}

/**
 * Pretend to be a device. Phones and tablets get 5 touch points, a PC or Mac
 * none, unless given. jsdom has no `maxTouchPoints`, so it is defined here and
 * removed again by `resetLaunchAndDevice`.
 */
export function setDevice(
  device: Device,
  maxTouchPoints = device === 'pc' || device === 'mac' ? 0 : 5,
): void {
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(UA[device]);
  Object.defineProperty(navigator, 'maxTouchPoints', {
    configurable: true,
    get: () => maxTouchPoints,
  });
}

/** Undo `setLaunch` and `setDevice`; use as `afterEach(resetLaunchAndDevice)`. */
export function resetLaunchAndDevice(): void {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  delete (navigator as { maxTouchPoints?: number }).maxTouchPoints;
}
