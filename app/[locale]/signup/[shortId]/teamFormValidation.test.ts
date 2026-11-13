import { describe, it, expect } from 'vitest';
import { TEAM_NAME_MAX, TEAM_NAME_MIN } from '@/lib/games/registration';
import { validateTeamName } from './teamFormValidation';

/**
 * Adapted to assert error CODES (not Norwegian strings) after the
 * teamFormValidation → code-based refactor (i18n phase 2f).
 * The component translates codes via t('signup.errors.<code>', values).
 */

describe('validateTeamName', () => {
  it.each([
    ['', { code: 'teamNameEmpty' }],
    ['  ', { code: 'teamNameEmpty' }],
    ['ab', { code: 'teamNameTooShort', min: TEAM_NAME_MIN }],
    ['x'.repeat(TEAM_NAME_MAX + 1), { code: 'teamNameTooLong', max: TEAM_NAME_MAX }],
  ] as const)('rejects «%s»', (input, expected) => {
    expect(validateTeamName(input)).toEqual(expected);
  });

  it.each([['Birdie-jegerne'], ['abc'], ['x'.repeat(TEAM_NAME_MAX)]])(
    'accepts «%s»',
    (input) => {
      expect(validateTeamName(input)).toBeNull();
    },
  );
});
