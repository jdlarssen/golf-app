import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
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

/**
 * Type B, #2352: «Installer» on an iPad that reports a Mac. Safari on iPadOS 13+
 * sends a Mac user agent, so only the touch points tell it from a real Mac.
 */
describe('InstallBanner «Installer» on iPad (#2352)', () => {
  const instructions = noMessages.installInstructions;

  it('shows the Safari steps with the iPad share-button text', async () => {
    setLaunch(undefined);
    setDevice('mac', 5);
    render(<InstallBanner visible onVerdict={() => {}} />);

    fireEvent.click(await screen.findByText(noMessages.installBanner.install));

    expect(screen.getByText(instructions.iosStep2)).toBeInTheDocument();
    expect(screen.getByText(/øverst til høyre i Safari/)).toBeInTheDocument();
    expect(screen.queryByText(instructions.unsupportedDescription)).toBeNull();
  });

  it('keeps the bottom-of-screen text on iPhone', async () => {
    setLaunch(undefined);
    setDevice('iphone');
    render(<InstallBanner visible onVerdict={() => {}} />);

    fireEvent.click(await screen.findByText(noMessages.installBanner.install));

    expect(screen.getByText(instructions.iosStep2)).toBeInTheDocument();
    expect(screen.getByText(/nederst på skjermen/)).toBeInTheDocument();
    expect(screen.queryByText(/øverst til høyre i Safari/)).toBeNull();
  });

  it('still says unsupported on a real Mac', async () => {
    setLaunch(undefined);
    setDevice('mac', 0);
    render(<InstallBanner visible onVerdict={() => {}} />);

    fireEvent.click(await screen.findByText(noMessages.installBanner.install));

    expect(
      screen.getByText(instructions.unsupportedDescription),
    ).toBeInTheDocument();
    expect(screen.queryByText(instructions.iosStep2)).toBeNull();
  });
});
