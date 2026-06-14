import { describe, expect, it } from 'vitest';
import { first, resolveErrorCode } from './searchParams';

describe('first', () => {
  it.each<[string | string[] | undefined, string | undefined]>([
    [undefined, undefined],
    ['a', 'a'],
    [['a', 'b'], 'a'],
    [[], undefined],
  ])('%o → %o', (input, expected) => {
    expect(first(input)).toBe(expected);
  });
});

describe('resolveErrorCode', () => {
  const codes = new Set(['rate_limited', 'unknown'] as const);

  it('returns undefined when the value is absent', () => {
    expect(resolveErrorCode(undefined, codes, 'unknown')).toBeUndefined();
  });

  it('passes a recognised code through unchanged', () => {
    expect(resolveErrorCode('rate_limited', codes, 'unknown')).toBe('rate_limited');
  });

  it('collapses a present-but-unknown value to the fallback', () => {
    expect(resolveErrorCode('bogus', codes, 'unknown')).toBe('unknown');
  });
});
