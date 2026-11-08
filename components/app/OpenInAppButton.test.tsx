import { afterEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { OpenInAppButton } from './OpenInAppButton';
import { resetLaunchAndDevice, setDevice, setLaunch } from '@/lib/app/__tests__/_helpers';

afterEach(resetLaunchAndDevice);

/** Type C, one render: the rules are Type A in lib/appLinks/openInApp.test.ts. */
describe('OpenInAppButton', () => {
  const props = { path: '/liga/bli-med/abcd2345', locale: 'no', fromLink: true, noApp: false };

  it('is a real link on a phone, and nothing at all on a computer', () => {
    setDevice('iphone');
    const { unmount } = render(<OpenInAppButton {...props} />);
    expect(screen.getByTestId('open-in-app-button').tagName).toBe('A');
    expect(screen.getByTestId('open-in-app-button').getAttribute('href')).toBe(
      '/liga/bli-med/abcd2345?uten-app=1',
    );
    unmount();

    setDevice('pc');
    const { container } = render(<OpenInAppButton {...props} />);
    expect(container.firstChild).toBeNull();
  });

  it('after a try, the notice shows its store badges only when the app is out', () => {
    setDevice('iphone');
    setLaunch('off');
    const { unmount } = render(<OpenInAppButton {...props} noApp />);
    expect(screen.getByTestId('open-in-app-notice')).toBeTruthy();
    expect(screen.queryByTestId('get-the-app')).toBeNull();
    unmount();

    setLaunch('on');
    render(<OpenInAppButton {...props} noApp />);
    expect(screen.getByTestId('get-the-app')).toBeTruthy();
  });
});
