import { afterEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { GetTheApp } from './GetTheApp';
import { AppCtaLink } from './AppCtaLink';
import { APP_STORE_URL, GOOGLE_PLAY_URL } from '@/lib/app/storeLinks';
import noMessages from '@/messages/no.json';
import {
  resetLaunchAndDevice,
  setDevice,
  setLaunch,
  type Device,
} from '@/lib/app/__tests__/_helpers';

function on(flag: string | undefined, device: Device) {
  setLaunch(flag);
  setDevice(device);
}

afterEach(resetLaunchAndDevice);

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
  Device,
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
    on(flag, ua);
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
    on('on', 'iphone');
    const html = renderToString(<GetTheApp />);
    expect(html).toContain(APP_STORE_URL);
    expect(html).toContain(GOOGLE_PLAY_URL);
    expect(renderToString(<GetTheApp deviceOnly />)).toBe('');
  });
});

describe('AppCtaLink', () => {
  it.each<[string | undefined, Device, string]>([
    ['on', 'iphone', APP_STORE_URL],
    ['on', 'android', GOOGLE_PLAY_URL],
    ['on', 'pc', '/demo'],
    ['ios', 'iphone', '/demo'],
    [undefined, 'iphone', '/demo'],
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
    on('on', 'iphone');
    expect(renderToString(<AppCtaLink href="/demo">x</AppCtaLink>)).toContain(
      'href="/demo"',
    );
  });
});
