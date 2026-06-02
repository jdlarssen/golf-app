import { describe, it, expect } from 'vitest';
import { maskEmail } from './maskEmail';

describe('maskEmail', () => {
  it.each([
    ['ola@gmail.com', 'ol•••@gmail.com'],
    ['jorgen@tornygolf.no', 'jo•••@tornygolf.no'],
    ['a@b.com', 'a•••@b.com'],
    ['ab@b.com', 'a•••@b.com'],
    ['abc@b.com', 'ab•••@b.com'],
    ['  Ola@Gmail.com  ', 'Ol•••@Gmail.com'],
  ])('masks %s → %s', (input, expected) => {
    expect(maskEmail(input)).toBe(expected);
  });

  it('returnerer input uendret når @ mangler', () => {
    expect(maskEmail('ikke-en-epost')).toBe('ikke-en-epost');
  });

  it('returnerer tom streng for tom input', () => {
    expect(maskEmail('')).toBe('');
  });

  it('beholder hele domenet (skiller gmail fra jobb-adresse)', () => {
    expect(maskEmail('navn@subdomain.example.co.uk')).toBe(
      'na•••@subdomain.example.co.uk',
    );
  });
});
