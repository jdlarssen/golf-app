import { describe, it, expect } from 'vitest';
import { playerGenderDefault } from './playerGenderDefault';

describe('playerGenderDefault', () => {
  it('mens + normal → M', () => {
    expect(playerGenderDefault('mens', 'normal')).toBe('M');
  });

  it('ladies + normal → D', () => {
    expect(playerGenderDefault('ladies', 'normal')).toBe('D');
  });

  it('mens + junior → J (junior overrides gender)', () => {
    expect(playerGenderDefault('mens', 'junior')).toBe('J');
  });

  it('ladies + junior → J (junior overrides gender)', () => {
    expect(playerGenderDefault('ladies', 'junior')).toBe('J');
  });

  it('null + normal → M (backwards-compat fallback)', () => {
    expect(playerGenderDefault(null, 'normal')).toBe('M');
  });

  it('null + junior → J (junior wins over null gender)', () => {
    expect(playerGenderDefault(null, 'junior')).toBe('J');
  });

  it('mens + senior → M (senior does not affect toggle today)', () => {
    expect(playerGenderDefault('mens', 'senior')).toBe('M');
  });

  it('ladies + senior → D (senior does not affect toggle today)', () => {
    expect(playerGenderDefault('ladies', 'senior')).toBe('D');
  });
});
