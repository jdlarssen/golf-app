import { describe, it, expect } from 'vitest';
import { canonicalPath } from './canonical';

// Type A (pure logic) per docs/test-discipline.md — the canonical helper feeds
// every public page's <link rel="canonical">, so its locale/path composition is
// worth locking down directly (#1264).
describe('canonicalPath', () => {
  it('keeps the default locale unprefixed', () => {
    expect(canonicalPath('no', '/spillformater')).toBe('/spillformater');
    expect(canonicalPath('no', '/baner/miklagard')).toBe('/baner/miklagard');
  });

  it('prefixes non-default locales', () => {
    expect(canonicalPath('en', '/spillformater')).toBe('/en/spillformater');
    expect(canonicalPath('en', '/legal/privacy')).toBe('/en/legal/privacy');
  });

  it('maps the front page to root per locale', () => {
    expect(canonicalPath('no', '/')).toBe('/');
    expect(canonicalPath('no', '')).toBe('/');
    expect(canonicalPath('en', '/')).toBe('/en');
    expect(canonicalPath('en', '')).toBe('/en');
  });
});
