import { describe, expect, it } from 'vitest';
import { routing } from '@/i18n/routing';
import { FRIEND_LINK_LOCALE_PREFIXES, FRIEND_LINK_PATH_PREFIXES } from '@/lib/friends/friendLinkPath';
import { APP_LINK_PATH_PREFIXES, LEAGUE_LINK_PREFIX, leagueLinkPath } from './appLinkPaths';

/**
 * Type A (#2748): the paths the app claims have one home. The store build's
 * filter (`native/app/app.config.ts`) and the Android proof are tested against
 * this list, and the app's parser reads the same prefixes.
 */
describe('APP_LINK_PATH_PREFIXES', () => {
  it('has the friend link and the league link, under every locale the site serves', () => {
    const locales = routing.locales.map((locale) => (locale === routing.defaultLocale ? '' : `/${locale}`));
    expect([...FRIEND_LINK_LOCALE_PREFIXES]).toEqual(locales);
    expect(APP_LINK_PATH_PREFIXES).toEqual([
      ...locales.flatMap((locale) => [`${locale}/venner/legg-til/`, `${locale}/liga/bli-med/`]),
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
