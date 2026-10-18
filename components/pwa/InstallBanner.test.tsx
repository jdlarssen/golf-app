import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { InstallBanner } from './InstallBanner';
import noMessages from '@/messages/no.json';
import {
  resetLaunchAndDevice,
  setDevice,
  setLaunch,
  type Device,
} from '@/lib/app/__tests__/_helpers';

beforeEach(() => {
  // Past the visit gate (#1186), nothing dismissed.
  localStorage.clear();
  localStorage.setItem('torny-home-visits', '5');
});

afterEach(resetLaunchAndDevice);

/**
 * Type C, #2562 (owner's answer 2): which banner holds the home-screen slot.
 * The rule is Type A (`appBannerStores`); here only that the slot follows it.
 */
describe('InstallBanner', () => {
  it.each<[string | undefined, Device, 'home' | 'app']>([
    [undefined, 'iphone', 'home'],
    ['ios', 'iphone', 'app'],
    ['ios', 'android', 'home'],
    ['ios', 'pc', 'home'],
    ['on', 'android', 'app'],
    ['on', 'pc', 'app'],
  ])('%s on %s → %s banner', async (flag, ua, expected) => {
    setLaunch(flag);
    setDevice(ua);
    render(<InstallBanner visible onVerdict={() => {}} />);

    const banner = noMessages.installBanner;
    if (expected === 'app') {
      expect(await screen.findByTestId('get-app-banner')).toHaveTextContent(
        banner.appTitle,
      );
      expect(screen.queryByText(banner.title)).toBeNull();
    } else {
      expect(await screen.findByText(banner.title)).toBeInTheDocument();
      expect(screen.queryByTestId('get-app-banner')).toBeNull();
    }
  });
});
