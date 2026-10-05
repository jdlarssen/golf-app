import { describe, it, expect } from 'vitest';
import { readMarkerFrom, withReadMarker, withoutReadMarker } from './readMarker';

const ID = '5f0c1b2a-3d4e-4f60-8a71-92b3c4d5e6f7';

describe('withReadMarker', () => {
  it.each([
    ['/games/abc', `/games/abc?varsel=${ID}`],
    ['/', `/?varsel=${ID}`],
    ['/admin/cup/x/spillere?tab=a', `/admin/cup/x/spillere?tab=a&varsel=${ID}`],
    ['/games/abc#top', `/games/abc?varsel=${ID}#top`],
    ['/games/abc?from=cup#top', `/games/abc?from=cup&varsel=${ID}#top`],
  ])('%s → %s', (path, expected) => {
    expect(withReadMarker(path, ID)).toBe(expected);
  });

  it('the page reads back the id the push put on, and strips it again', () => {
    const marked = withReadMarker('/games/abc?from=cup#top', ID);
    expect(readMarkerFrom(new URL(marked, 'http://local').search)).toBe(ID);
    expect(withoutReadMarker(marked)).toBe('/games/abc?from=cup#top');
  });
});

describe('readMarkerFrom', () => {
  it.each<[string, string | null]>([
    [`?varsel=${ID}`, ID],
    [`?from=cup&varsel=${ID}`, ID],
    [`?varsel=${ID.toUpperCase()}`, ID.toUpperCase()],
    ['', null],
    ['?from=cup', null],
    ['?varsel=', null],
    ['?varsel=abc', null],
    ["?varsel=1'%20or%201=1", null],
    [`?varsel=${ID}&varsel=other`, ID],
  ])('%s → %s', (search, expected) => {
    expect(readMarkerFrom(search)).toBe(expected);
  });
});

describe('withoutReadMarker', () => {
  it.each([
    [`https://tornygolf.no/games/abc?varsel=${ID}`, '/games/abc'],
    [`/games/abc?from=cup&varsel=${ID}#top`, '/games/abc?from=cup#top'],
    [`/?varsel=${ID}`, '/'],
    [`/games/abc?varsel=${ID}&varsel=other`, '/games/abc'],
    ['/games/abc?from=cup', '/games/abc?from=cup'],
  ])('%s → %s', (href, expected) => {
    expect(withoutReadMarker(href)).toBe(expected);
  });
});
