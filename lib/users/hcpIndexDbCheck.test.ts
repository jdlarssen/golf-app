/**
 * Trap #4 agreement test (AGENTS.md, #2222): the handicap bound lives in the
 * validator (`HCP_MIN` / `HCP_MAX`, read by every write path: profile,
 * onboarding, admin and guest), in the DB CHECK `users_hcp_index_range`, and as
 * numbers written into five error messages. Change one without the others and
 * this goes red.
 *
 * The validator's own edge cases (54, +10, 54.1, +10.1) are covered in
 * `profileInput.test.ts` and not repeated here.
 */
import { describe, it, expect } from 'vitest';
import noMessages from '@/messages/no.json';
import enMessages from '@/messages/en.json';
import { lastMigrationMatch } from '@/lib/__tests__/migrationCheck';
import { wholeNumber } from '@/lib/__tests__/copyNumbers';
import { HCP_MAX, HCP_MIN } from './profileInput';

describe('users.hcp_index CHECK ↔ HCP_MIN / HCP_MAX (#2222)', () => {
  it('the last migration bounding hcp_index uses the validator’s bounds', () => {
    const { match } = lastMigrationMatch(
      /hcp_index\s+between\s+(-?\d+(?:\.\d+)?)\s+and\s+(-?\d+(?:\.\d+)?)/i,
    );
    expect(Number(match[1])).toBe(HCP_MIN);
    expect(Number(match[2])).toBe(HCP_MAX);
  });
});

// The messages state the bound in their text. The app's copy is locked to
// no.json character by character (profileCopy.test.ts), so it follows.
describe('the handicap error messages state the same bound (#2222)', () => {
  const get = (messages: unknown, key: string): string =>
    key
      .split('.')
      .reduce<unknown>((node, part) => (node as Record<string, unknown>)[part], messages) as string;

  const cases = [
    ['onboarding.errors.hcp_invalid', [HCP_MAX]],
    ['profile.errors.hcp_invalid', [HCP_MAX]],
    ['game.players.errorMessages.guest_invalid_hcp', [HCP_MAX]],
    ['admin.game.errors.guest_invalid_hcp', [HCP_MAX]],
    ['admin.players.profile.errors.hcp_out_of_range', [HCP_MIN, HCP_MAX]],
  ] as const;

  it.each(
    cases.flatMap(([key, numbers]) => [
      ['no', key, numbers, get(noMessages, key)],
      ['en', key, numbers, get(enMessages, key)],
    ]),
  )('%s: %s nevner %j', (_locale, _key, numbers, text) => {
    for (const n of numbers) expect(text).toMatch(wholeNumber(n));
  });
});
