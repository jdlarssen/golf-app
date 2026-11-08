// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { appLinkLanding, openInAppHref, openInAppView } from './openInApp';

/** Type A (#2748): where «Åpne i appen» goes, and when it shows. */

const ID = '44444444-4444-4444-8444-444444444444';

describe('openInAppHref', () => {
  it('goes to www on the production host, since Safari keeps a link to its own domain inside', () => {
    expect(openInAppHref(`/runde/${ID}`, 'tornygolf.no', 'no')).toBe(
      `https://www.tornygolf.no/runde/${ID}?uten-app=1`,
    );
  });

  it.each(['golf-app-git-x-jdlarssen-prosjekter.vercel.app', 'localhost:3111', 'www.tornygolf.no.evil.example'])(
    'stays on %s, so a test never sends anyone to production',
    (host) => {
      expect(openInAppHref(`/runde/${ID}`, host, 'no')).toBe(`/runde/${ID}?uten-app=1`);
    },
  );

  it('keeps the locale in the path', () => {
    expect(openInAppHref('/liga/bli-med/abcd2345', 'tornygolf.no', 'en')).toBe(
      'https://www.tornygolf.no/en/liga/bli-med/abcd2345?uten-app=1',
    );
  });

  it('keeps the query the path came with', () => {
    expect(openInAppHref('/pamelding/abcd2345?src=plakat', 'tornygolf.no', 'no')).toBe(
      'https://www.tornygolf.no/pamelding/abcd2345?src=plakat&uten-app=1',
    );
    expect(openInAppHref(`/invitasjon/${ID}?email=a%40b.no`, 'tornygolf.no', 'no')).toBe(
      `https://www.tornygolf.no/invitasjon/${ID}?email=a%40b.no&uten-app=1`,
    );
  });

  // The app's own buttons need these pages to open the browser, and the button
  // would land on them with no app to open.
  it.each(['/games/x', '/signup/abcd2345', '/login', `/login?invite=${ID}`, '/spectate/x'])(
    'never builds a link to %s',
    (path) => {
      expect(openInAppHref(path, 'tornygolf.no', 'no')).toBeNull();
    },
  );
});

describe('appLinkLanding', () => {
  it.each([
    [{}, { fromLink: false, noApp: false }],
    [{ fra: 'lenke' }, { fromLink: true, noApp: false }],
    [{ 'uten-app': '1' }, { fromLink: false, noApp: true }],
    [{ fra: 'lenke', 'uten-app': '1' }, { fromLink: true, noApp: true }],
    [{ fra: ['lenke', 'x'] }, { fromLink: true, noApp: false }],
    [{ fra: 'noe-annet', 'uten-app': '0' }, { fromLink: false, noApp: false }],
  ])('%j gives %j', (query, expected) => {
    expect(appLinkLanding(query)).toEqual(expected);
  });
});

describe('openInAppView', () => {
  const phone = { platform: 'ios', standalone: false, fromLink: true, noApp: false } as const;

  it.each([
    ['iPhone from a link', phone, { button: true, notice: false }],
    ['Android from a link', { ...phone, platform: 'android' }, { button: true, notice: false }],
    ['a computer', { ...phone, platform: 'other' }, { button: false, notice: false }],
    ['before hydration', { ...phone, platform: 'unknown' }, { button: false, notice: false }],
    ['an installed PWA', { ...phone, standalone: true }, { button: false, notice: false }],
    ['a phone that did not come from a link', { ...phone, fromLink: false }, { button: false, notice: false }],
    ['back without the app', { ...phone, noApp: true }, { button: true, notice: true }],
    ['the notice on a computer', { ...phone, platform: 'other', noApp: true }, { button: false, notice: true }],
  ] as const)('%s', (_name, facts, expected) => {
    expect(openInAppView(facts)).toEqual(expected);
  });
});
