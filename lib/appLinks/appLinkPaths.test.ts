import { describe, expect, it } from 'vitest';
import { routing } from '@/i18n/routing';
import { FRIEND_LINK_LOCALE_PREFIXES, FRIEND_LINK_PATH_PREFIXES } from '@/lib/friends/friendLinkPath';
import { isInviteToken } from '@/lib/auth/getInviteLoginContext';
import { isUuid } from '@/lib/url/isUuid';
import {
  APP_LINK_PATH_PREFIXES,
  LEAGUE_LINK_PREFIX,
  invitationLinkPath,
  isRoundLinkSubpage,
  leagueLinkPath,
  roundLinkPath,
} from './appLinkPaths';

/**
 * Type A (#2748): the paths the app claims have one home. The store build's
 * filter (`native/app/app.config.ts`) and the Android proof are tested against
 * this list, and the app's parser reads the same prefixes.
 */
describe('APP_LINK_PATH_PREFIXES', () => {
  it('has the friend, league, invitation and round links, under every locale the site serves', () => {
    const locales = routing.locales.map((locale) => (locale === routing.defaultLocale ? '' : `/${locale}`));
    expect([...FRIEND_LINK_LOCALE_PREFIXES]).toEqual(locales);
    expect(APP_LINK_PATH_PREFIXES).toEqual([
      ...locales.flatMap((locale) => [
        `${locale}/venner/legg-til/`,
        `${locale}/liga/bli-med/`,
        `${locale}/invitasjon/`,
        `${locale}/runde/`,
      ]),
    ]);
  });

  it('includes every path the friend link already had', () => {
    for (const prefix of FRIEND_LINK_PATH_PREFIXES) expect(APP_LINK_PATH_PREFIXES).toContain(prefix);
  });

  // Anything here would stop opening the browser for someone with the app.
  it.each(['/games/', '/signup/', '/login', '/spectate/', '/liga/', '/cup/', '/klubber/', '/admin/', '/legal/'])(
    'does not claim %s',
    (other) => {
      expect(APP_LINK_PATH_PREFIXES).not.toContain(other);
      expect(APP_LINK_PATH_PREFIXES).not.toContain(`/en${other}`);
    },
  );
});

describe('leagueLinkPath', () => {
  it('builds the path the web page lives on', () => {
    expect(leagueLinkPath('abcd2345')).toBe('/liga/bli-med/abcd2345');
    expect(leagueLinkPath('abcd2345').startsWith(LEAGUE_LINK_PREFIX)).toBe(true);
  });
});

describe('invitationLinkPath and roundLinkPath', () => {
  it('build the paths mail links to', () => {
    expect(invitationLinkPath('t1')).toBe('/invitasjon/t1');
    expect(roundLinkPath('g1')).toBe('/runde/g1');
    expect(roundLinkPath('g1', 'holes/7')).toBe('/runde/g1/holes/7');
  });
});

describe('isRoundLinkSubpage', () => {
  it.each(['', 'holes/1', 'holes/9', 'holes/10', 'holes/18', 'submit', 'avslutt', 'leaderboard'])('allows %j', (subpage) => {
    expect(isRoundLinkSubpage(subpage)).toBe(true);
  });

  it.each([
    'holes',
    'holes/0',
    'holes/19',
    'holes/01',
    'holes/1/2',
    'holes/x',
    'slett',
    'rediger',
    'flytt',
    'spillere',
    'premieutdeling',
    'submit/mer',
    'leaderboard/export',
    '../admin',
  ])('refuses %j', (subpage) => {
    expect(isRoundLinkSubpage(subpage)).toBe(false);
  });
});

// The app's parser cannot import the server module `isInviteToken` lives in, and
// uses `isUuid`. The two must stay the same rule (AGENTS.md trap 4).
describe('the invitation token shape', () => {
  it.each([
    ['44444444-4444-4444-8444-444444444444', true],
    ['ABCDEF00-4444-4444-8444-444444444444', true],
    ['44444444-4444-4444-8444-44444444444', false],
    ['not-a-token', false],
    ['', false],
  ])('%j agrees in both homes', (value, ok) => {
    expect(isInviteToken(value)).toBe(ok);
    expect(isUuid(value)).toBe(ok);
  });
});
