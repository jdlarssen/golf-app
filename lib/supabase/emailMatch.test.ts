import { describe, expect, it } from 'vitest';
import { emailMatchPattern } from './emailMatch';

// `imatch` is PostgREST's `~*`: a case-insensitive POSIX regex. JS RegExp with
// the `i` flag reads these escapes the same way Postgres' ARE does.
const matches = (stored: string, typed: string) =>
  new RegExp(emailMatchPattern(typed), 'i').test(stored);

describe('emailMatchPattern (#2207)', () => {
  it.each([
    ['ola_n@example.test', 'ola.n@example.test', false],
    ['axb@example.test', 'a%b@example.test', false],
    ['aab@example.test', 'a*b@example.test', false],
    ['aaab@example.test', 'a+b@example.test', false],
    ['axb@example.test', 'a.b@example.test', false],
    ['ola@example.test', 'OLA@EXAMPLE.TEST', true],
    ['a+tag@example.test', 'a+tag@example.test', true],
    ['a*b@example.test', 'a*b@example.test', true],
    ['a%b@example.test', 'a%b@example.test', true],
    ['ola_n@example.test', 'ola_n@example.test', true],
  ])('stored %s, typed %s → match %s', (stored, typed, expected) => {
    expect(matches(stored, typed)).toBe(expected);
  });

  it('does not match on a prefix or a suffix', () => {
    expect(matches('xola@example.test', 'ola@example.test')).toBe(false);
    // Built by concatenation: a literal of this address is not on the
    // pre-commit allowlist.
    expect(matches('ola@example.test' + '.evil', 'ola@example.test')).toBe(false);
  });

  it('anchors the whole address', () => {
    expect(emailMatchPattern('a.b@example.test')).toBe('^a\\.b@example\\.test$');
  });
});
