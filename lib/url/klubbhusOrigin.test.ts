import { describe, expect, it } from 'vitest';
import { klubbhusBackHref, withKlubbhusOrigin } from './klubbhusOrigin';

describe('withKlubbhusOrigin', () => {
  it.each<[string, string]>([
    ['/spillformater', '/spillformater?kilde=klubbhuset'],
    ['/klubber/club-1', '/klubber/club-1?kilde=klubbhuset'],
    ['/opprett-bane?status=created', '/opprett-bane?status=created&kilde=klubbhuset'],
  ])('%s → %s', (href, expected) => {
    expect(withKlubbhusOrigin(href)).toBe(expected);
  });
});

describe('klubbhusBackHref', () => {
  it.each<[string | string[] | undefined, string]>([
    ['klubbhuset', '/admin'],
    [['klubbhuset'], '/admin'],
    [undefined, '/klubber'],
    ['hjem', '/klubber'],
    [[], '/klubber'],
  ])('%o → %s', (raw, expected) => {
    expect(klubbhusBackHref(raw, '/klubber')).toBe(expected);
  });
});
