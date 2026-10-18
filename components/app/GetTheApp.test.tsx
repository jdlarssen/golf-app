import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { GetTheApp } from './GetTheApp';
import { AppCtaLink } from './AppCtaLink';
import { APP_STORE_URL, GOOGLE_PLAY_URL } from '@/lib/app/storeLinks';
import noMessages from '@/messages/no.json';

const UA = {
  iphone:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  android:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36',
  pc: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
};

function on(flag: string | undefined, ua: string) {
  vi.stubEnv('NEXT_PUBLIC_APP_LAUNCH', flag);
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(ua);
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const t = noMessages.getTheApp;

function badgeHrefs() {
  return screen
    .queryAllByRole('link')
    .map((a) => [a.getAttribute('aria-label'), a.getAttribute('href')]);
}

/**
 * Type B: what «Hent appen» renders per switch state and device. The rule
 * itself (storesFor) is Type A in lib/app/appLaunch.test.ts; here only that
 * the component follows it, with the right links and labels.
 */
describe('GetTheApp', () => {
  it('renders nothing while the switch is off', () => {
    on(undefined, UA.iphone);
    const { container } = render(<GetTheApp />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows both badges on a PC with on, as a titled card', () => {
    on('on', UA.pc);
    render(<GetTheApp />);
    expect(
      screen.getByRole('region', { name: t.title }),
    ).toBeInTheDocument();
    expect(screen.getByText(t.body)).toBeInTheDocument();
    expect(badgeHrefs()).toEqual([
      [t.appStoreAria, APP_STORE_URL],
      [t.googlePlayAria, GOOGLE_PLAY_URL],
    ]);
  });

  it('keeps only the device’s own store after hydration', () => {
    on('on', UA.iphone);
    const { unmount } = render(<GetTheApp />);
    expect(badgeHrefs()).toEqual([[t.appStoreAria, APP_STORE_URL]]);
    unmount();

    on('on', UA.android);
    render(<GetTheApp />);
    expect(badgeHrefs()).toEqual([[t.googlePlayAria, GOOGLE_PLAY_URL]]);
  });

  it('with ios shows the App Store only, and nothing on Android', () => {
    on('ios', UA.pc);
    const { unmount } = render(<GetTheApp />);
    expect(badgeHrefs()).toEqual([[t.appStoreAria, APP_STORE_URL]]);
    unmount();

    on('ios', UA.android);
    const { container } = render(<GetTheApp />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders every store that is out on the server, whatever the device', () => {
    on('on', UA.iphone);
    const html = renderToString(<GetTheApp />);
    expect(html).toContain(APP_STORE_URL);
    expect(html).toContain(GOOGLE_PLAY_URL);
  });

  it('deviceOnly: nothing on a PC or on the server, the card on an iPhone', () => {
    on('ios', UA.pc);
    const { container, unmount } = render(<GetTheApp deviceOnly />);
    expect(container).toBeEmptyDOMElement();
    unmount();
    expect(renderToString(<GetTheApp deviceOnly />)).toBe('');

    on('ios', UA.iphone);
    render(<GetTheApp deviceOnly />);
    expect(badgeHrefs()).toEqual([[t.appStoreAria, APP_STORE_URL]]);
  });

  it('inline: one line of text and the badges, no heading', () => {
    on('on', UA.pc);
    render(<GetTheApp variant="inline" />);
    expect(screen.getByText(t.inline)).toBeInTheDocument();
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
    expect(badgeHrefs()).toHaveLength(2);
  });

  it('badge links open in the same tab with a 44 px tap target', () => {
    on('on', UA.pc);
    render(<GetTheApp />);
    for (const link of screen.getAllByRole('link')) {
      expect(link).not.toHaveAttribute('target');
      expect(link.className).toContain('min-h-11');
    }
  });
});

describe('AppCtaLink', () => {
  it.each([
    ['on', UA.iphone, APP_STORE_URL],
    ['on', UA.android, GOOGLE_PLAY_URL],
    ['on', UA.pc, '/demo'],
    ['ios', UA.iphone, '/demo'],
    [undefined, UA.iphone, '/demo'],
  ])('%s on %s → %s', (flag, ua, expected) => {
    on(flag, ua);
    render(
      <AppCtaLink href="/demo" data-testid="cta">
        x
      </AppCtaLink>,
    );
    expect(screen.getByTestId('cta')).toHaveAttribute('href', expected);
  });

  it('points to /demo on the server, so first render and hydration agree', () => {
    on('on', UA.iphone);
    expect(renderToString(<AppCtaLink href="/demo">x</AppCtaLink>)).toContain(
      'href="/demo"',
    );
  });
});
