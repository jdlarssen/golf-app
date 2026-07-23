import { describe, it, expect } from 'vitest';
import { canonicalPath } from './canonical';

describe('canonicalPath', () => {
  it('keeps the default locale unprefixed for a normal path', () => {
    expect(canonicalPath('no', '/baner/oslo')).toBe('/baner/oslo');
  });

  it('prefixes non-default locales for a normal path', () => {
    expect(canonicalPath('en', '/baner/oslo')).toBe('/en/baner/oslo');
  });

  // #1265 root special case — the front page canonicalizes WITHOUT a trailing
  // slash so it matches app/sitemap.ts (which lists the root as `/en`, `/`).
  it('returns "/" for the root on the default locale', () => {
    expect(canonicalPath('no', '/')).toBe('/');
  });

  it('returns "/en" (no trailing slash) for the root on a non-default locale', () => {
    expect(canonicalPath('en', '/')).toBe('/en');
  });
});
