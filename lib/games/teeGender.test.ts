import { describe, it, expect } from 'vitest';
import { teeGenderOf } from './teeGender';

describe('teeGenderOf', () => {
  it('returns "ladies" for female', () => {
    expect(teeGenderOf('female')).toBe('ladies');
  });
  it('returns "mens" for non-female (null)', () => {
    expect(teeGenderOf(null)).toBe('mens');
  });
  it('returns "mens" for "male"', () => {
    expect(teeGenderOf('male')).toBe('mens');
  });
});
