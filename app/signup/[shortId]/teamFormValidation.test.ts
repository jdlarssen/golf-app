import { describe, it, expect } from 'vitest';
import {
  validateTeamName,
  validateSlotEmail,
  findSlotConflicts,
} from './teamFormValidation';

describe('validateTeamName', () => {
  it.each([
    ['', 'Skriv inn et lag-navn.'],
    ['  ', 'Skriv inn et lag-navn.'],
    ['ab', 'Lag-navnet må være minst 3 tegn.'],
    ['x'.repeat(41), 'Lag-navnet kan være maks 40 tegn.'],
  ])('avviser «%s»', (input, expected) => {
    expect(validateTeamName(input)).toBe(expected);
  });

  it.each([['Birdie-jegerne'], ['abc'], ['x'.repeat(40)]])(
    'godtar «%s»',
    (input) => {
      expect(validateTeamName(input)).toBeNull();
    },
  );
});

describe('validateSlotEmail', () => {
  it.each([
    ['', 'Fyll inn e-post til medspilleren.'],
    ['ola', 'Skriv inn en gyldig e-postadresse.'],
    ['ola@', 'Skriv inn en gyldig e-postadresse.'],
    ['ola@gmail', 'Skriv inn en gyldig e-postadresse.'],
    ['@gmail.com', 'Skriv inn en gyldig e-postadresse.'],
  ])('avviser «%s»', (input, expected) => {
    expect(validateSlotEmail(input)).toBe(expected);
  });

  it.each([['ola@gmail.com'], ['  Ola@Gmail.com  '], ['a.b+c@x.co.uk']])(
    'godtar «%s»',
    (input) => {
      expect(validateSlotEmail(input)).toBeNull();
    },
  );
});

describe('findSlotConflicts', () => {
  it('returnerer tom map når alt er unikt', () => {
    expect(findSlotConflicts(['a@x.no', 'b@x.no'], 'cap@x.no')).toEqual({});
  });

  it('flagger begge plassene ved duplikat (case-insensitivt)', () => {
    expect(findSlotConflicts(['ola@x.no', 'Ola@x.no'], 'cap@x.no')).toEqual({
      0: 'Samme e-post er brukt på flere plasser.',
      1: 'Samme e-post er brukt på flere plasser.',
    });
  });

  it('flagger kapteinens egen e-post', () => {
    expect(findSlotConflicts(['cap@x.no'], 'CAP@x.no')).toEqual({
      0: 'Dette er din egen e-post. Du er allerede med som kaptein.',
    });
  });

  it('ignorerer tomme slots', () => {
    expect(findSlotConflicts(['', 'b@x.no', ''], null)).toEqual({});
  });

  it('prioriterer egen-e-post over duplikat-melding', () => {
    const res = findSlotConflicts(['cap@x.no', 'cap@x.no'], 'cap@x.no');
    expect(res[0]).toBe(
      'Dette er din egen e-post. Du er allerede med som kaptein.',
    );
    expect(res[1]).toBe(
      'Dette er din egen e-post. Du er allerede med som kaptein.',
    );
  });
});
