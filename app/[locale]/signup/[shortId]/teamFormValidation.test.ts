import { describe, it, expect } from 'vitest';
import {
  validateTeamName,
  validateSlotEmail,
  findSlotConflicts,
  TEAM_NAME_MIN,
  TEAM_NAME_MAX,
} from './teamFormValidation';

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

describe('validateSlotEmail', () => {
  it.each([
    ['', { code: 'slotEmailEmpty' }],
    ['ola', { code: 'slotEmailInvalid' }],
    ['ola@', { code: 'slotEmailInvalid' }],
    ['ola@gmail', { code: 'slotEmailInvalid' }],
    ['@gmail.com', { code: 'slotEmailInvalid' }],
  ] as const)('rejects «%s»', (input, expected) => {
    expect(validateSlotEmail(input)).toEqual(expected);
  });

  it.each([['ola@gmail.com'], ['  Ola@Gmail.com  '], ['a.b+c@x.co.uk']])(
    'accepts «%s»',
    (input) => {
      expect(validateSlotEmail(input)).toBeNull();
    },
  );
});

describe('findSlotConflicts', () => {
  it('returns empty map when all unique', () => {
    expect(findSlotConflicts(['a@x.no', 'b@x.no'], 'cap@x.no')).toEqual({});
  });

  it('flags both slots for duplicate (case-insensitive)', () => {
    expect(findSlotConflicts(['ola@x.no', 'Ola@x.no'], 'cap@x.no')).toEqual({
      0: { code: 'slotEmailDuplicate' },
      1: { code: 'slotEmailDuplicate' },
    });
  });

  it("flags captain's own email", () => {
    expect(findSlotConflicts(['cap@x.no'], 'CAP@x.no')).toEqual({
      0: { code: 'slotEmailSelf' },
    });
  });

  it('ignores empty slots', () => {
    expect(findSlotConflicts(['', 'b@x.no', ''], null)).toEqual({});
  });

  it("prioritises self-email over duplicate code", () => {
    const res = findSlotConflicts(['cap@x.no', 'cap@x.no'], 'cap@x.no');
    expect(res[0]).toEqual({ code: 'slotEmailSelf' });
    expect(res[1]).toEqual({ code: 'slotEmailSelf' });
  });
});
