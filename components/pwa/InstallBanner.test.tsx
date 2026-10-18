import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { InstallBanner } from './InstallBanner';
import noMessages from '@/messages/no.json';

const UA = {
  iphone:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  android:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36',
  pc: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
};

beforeEach(() => {
  // Past the visit gate (#1186), nothing dismissed.
  localStorage.clear();
  localStorage.setItem('torny-home-visits', '5');
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

/**
 * Type C, #2562 (owner's answer 2): which banner holds the home-screen slot.
 * The rule is Type A (`appBannerStores`); here only that the slot follows it.
 */
describe('InstallBanner', () => {
  it.each([
    [undefined, UA.iphone, 'home'],
    ['ios', UA.iphone, 'app'],
    ['ios', UA.android, 'home'],
    ['ios', UA.pc, 'home'],
    ['on', UA.android, 'app'],
    ['on', UA.pc, 'app'],
  ])('%s on %s → %s banner', async (flag, ua, expected) => {
    vi.stubEnv('NEXT_PUBLIC_APP_LAUNCH', flag);
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(ua);
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
