import { describe, expect, it } from 'vitest';
import type { Intent } from './intent';
import { isValidClubChoice, startClubId, startIntent } from './clubChoice';

// Type A (docs/test-discipline.md): the one home of the rule «a club
// tournament needs a valid club» (#2439). `clubIds` is the wizard's list of
// clubs you are a member of and that have not expired.

describe('startClubId', () => {
  it.each<[string, Intent | undefined, string, string[], string]>([
    ['a seeded club wins (edit, revansje, ?klubb=)', 'klubb', 'b', ['a', 'b'], 'b'],
    ['a seeded club wins even when it is not valid', 'klubb', 'gone', ['a'], 'gone'],
    ['a seeded club wins for another intent too', 'kompis', 'a', ['a'], 'a'],
    ['klubb with one valid club picks it', 'klubb', '', ['a'], 'a'],
    ['klubb with two valid clubs picks none', 'klubb', '', ['a', 'b'], ''],
    ['klubb without a valid club picks none', 'klubb', '', [], ''],
    ['another intent never picks a club', 'kompis', '', ['a'], ''],
    ['no intent yet never picks a club', undefined, '', ['a'], ''],
  ])('%s', (_label, intent, seeded, clubIds, expected) => {
    expect(startClubId({ intent, seeded, clubIds })).toBe(expected);
  });
});

describe('isValidClubChoice', () => {
  it.each<[string, Intent | undefined, string, string[], boolean]>([
    ['not a club tournament: always valid', 'kompis', '', [], true],
    ['no intent yet: valid', undefined, '', [], true],
    ['cup: valid without a club', 'cup', '', ['a'], true],
    ['klubb without a club: invalid', 'klubb', '', ['a'], false],
    ['klubb with a valid club: valid', 'klubb', 'b', ['a', 'b'], true],
    ['klubb with a club not in the list: invalid', 'klubb', 'gone', ['a'], false],
    ['klubb with no valid clubs at all: invalid', 'klubb', '', [], false],
  ])('%s', (_label, intent, groupId, clubIds, expected) => {
    expect(isValidClubChoice({ intent, groupId, clubIds })).toBe(expected);
  });
});

describe('startIntent', () => {
  it.each<[string, Intent | undefined, string[], Intent | undefined]>([
    ['klubb without a valid club starts on step 1 with nothing chosen', 'klubb', [], undefined],
    ['klubb with a valid club stays klubb', 'klubb', ['a'], 'klubb'],
    ['kompis stays kompis without clubs', 'kompis', [], 'kompis'],
    ['cup stays cup', 'cup', [], 'cup'],
    ['solo stays solo', 'solo', ['a'], 'solo'],
    ['no intent stays none', undefined, ['a'], undefined],
  ])('%s', (_label, intent, clubIds, expected) => {
    expect(startIntent({ intent, clubIds })).toBe(expected);
  });
});
