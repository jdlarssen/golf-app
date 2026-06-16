import { describe, expect, it } from 'vitest';
import {
  matchAcceptLanguage,
  resolveLocale,
  toSupportedLocale,
} from './resolveLocale';

describe('toSupportedLocale', () => {
  it.each([
    ['no', 'no'],
    ['en', 'en'],
    ['NO', 'no'],
    ['nb', 'no'],
    ['nn', 'no'],
    ['fr', null],
    ['', null],
    [null, null],
    [undefined, null],
  ] as const)('%j -> %j', (input, expected) => {
    expect(toSupportedLocale(input)).toBe(expected);
  });
});

describe('matchAcceptLanguage', () => {
  it.each([
    // Plain matches
    ['en', 'en'],
    ['no', 'no'],
    // Region subtags fall back to base language
    ['en-GB', 'en'],
    ['nb-NO', 'no'],
    ['nn-NO', 'no'],
    // q-values decide order
    ['en;q=0.5,nb;q=0.9', 'no'],
    ['fr,en;q=0.8', 'en'],
    // Unsupported-only headers give no match
    ['fr-FR,de;q=0.9', null],
    // Garbage and empty input
    ['', null],
    [null, null],
    [';;;', null],
    ['en;q=0', null],
  ] as const)('%j -> %j', (header, expected) => {
    expect(matchAcceptLanguage(header)).toBe(expected);
  });

  it('typical Norwegian Safari header lands on no', () => {
    expect(matchAcceptLanguage('nb-NO,nb;q=0.9,en-US;q=0.8,en;q=0.7')).toBe('no');
  });
});

describe('resolveLocale precedence (users.locale -> cookie -> Accept-Language -> no)', () => {
  it('users.locale beats cookie and Accept-Language', () => {
    expect(
      resolveLocale({
        userLocale: 'en',
        cookieLocale: 'no',
        acceptLanguage: 'nb-NO',
      }),
    ).toBe('en');
  });

  it('cookie beats Accept-Language when users.locale is unset', () => {
    expect(
      resolveLocale({
        userLocale: null,
        cookieLocale: 'en',
        acceptLanguage: 'nb-NO',
      }),
    ).toBe('en');
  });

  it('Accept-Language decides when neither DB nor cookie is set', () => {
    expect(resolveLocale({ acceptLanguage: 'en-US,en;q=0.9' })).toBe('en');
  });

  it('falls back to no when nothing matches', () => {
    expect(resolveLocale({})).toBe('no');
    expect(resolveLocale({ acceptLanguage: 'fr-FR' })).toBe('no');
  });

  it('invalid users.locale falls through the chain instead of winning', () => {
    expect(
      resolveLocale({
        userLocale: 'klingon',
        cookieLocale: 'en',
        acceptLanguage: 'nb-NO',
      }),
    ).toBe('en');
  });
});

describe('resolveLocale signedIn flag (#640 item 6)', () => {
  // A signed-in user with NULL users.locale should default to the app default
  // ('no'), NOT their browser's Accept-Language. An English-language browser
  // was routing a Norwegian-profiled admin to /en on first visit.
  it('signed-in user with NULL locale defaults to no, ignoring Accept-Language', () => {
    expect(
      resolveLocale({
        userLocale: null,
        acceptLanguage: 'en-US,en;q=0.9',
        signedIn: true,
      }),
    ).toBe('no');
  });

  it('signed-in user still honors an explicit users.locale over the default', () => {
    expect(
      resolveLocale({
        userLocale: 'en',
        acceptLanguage: 'nb-NO',
        signedIn: true,
      }),
    ).toBe('en');
  });

  it('signed-in user still honors the cookie over the default', () => {
    expect(
      resolveLocale({
        userLocale: null,
        cookieLocale: 'en',
        acceptLanguage: 'nb-NO',
        signedIn: true,
      }),
    ).toBe('en');
  });

  it('anonymous visitor (signedIn false/absent) keeps Accept-Language', () => {
    expect(
      resolveLocale({ acceptLanguage: 'en-US,en;q=0.9', signedIn: false }),
    ).toBe('en');
    expect(resolveLocale({ acceptLanguage: 'en-US,en;q=0.9' })).toBe('en');
  });
});
