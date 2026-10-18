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
 * Type C, one table: what «Hent appen» renders per switch state, device and
 * variant. The rule itself (storesFor) is Type A in lib/app/appLaunch.test.ts;
 * here only that the component follows it with the right links and labels.
 */
type Row = [
  string | undefined,
  keyof typeof UA,
  { variant?: 'card' | 'inline'; deviceOnly?: boolean },
  string[][],
];
describe('GetTheApp', () => {
  it.each<Row>([
    [undefined, 'iphone', {}, []],
    ['on', 'pc', {}, [[t.appStoreAria, APP_STORE_URL], [t.googlePlayAria, GOOGLE_PLAY_URL]]],
    ['on', 'iphone', {}, [[t.appStoreAria, APP_STORE_URL]]],
    ['on', 'android', {}, [[t.googlePlayAria, GOOGLE_PLAY_URL]]],
    ['ios', 'pc', {}, [[t.appStoreAria, APP_STORE_URL]]],
    ['ios', 'android', {}, []],
    ['ios', 'pc', { deviceOnly: true }, []],
    ['ios', 'iphone', { deviceOnly: true }, [[t.appStoreAria, APP_STORE_URL]]],
    ['on', 'pc', { variant: 'inline' }, [[t.appStoreAria, APP_STORE_URL], [t.googlePlayAria, GOOGLE_PLAY_URL]]],
  ])('%s on %s %j', (flag, ua, props, expected) => {
    on(flag, UA[ua]);
    const { container } = render(<GetTheApp {...props} />);
    expect(badgeHrefs()).toEqual(expected);
    if (expected.length === 0) {
      expect(container).toBeEmptyDOMElement();
      return;
    }
    // The card is a titled region; the inline line has no heading.
    if (props.variant === 'inline') {
      expect(screen.getByText(t.inline)).toBeInTheDocument();
      expect(screen.queryByRole('heading')).toBeNull();
    } else {
      expect(screen.getByRole('region', { name: t.title })).toBeInTheDocument();
    }
    // Same tab, 44 px tap target.
    for (const link of screen.getAllByRole('link')) {
      expect(link).not.toHaveAttribute('target');
      expect(link.className).toContain('min-h-11');
    }
  });

  it('renders every store that is out on the server, and nothing there with deviceOnly', () => {
    on('on', UA.iphone);
    const html = renderToString(<GetTheApp />);
    expect(html).toContain(APP_STORE_URL);
    expect(html).toContain(GOOGLE_PLAY_URL);
    expect(renderToString(<GetTheApp deviceOnly />)).toBe('');
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
