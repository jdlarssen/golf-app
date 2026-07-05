import { describe, it, expect } from 'vitest';
import { teeGenderOf } from './teeGender';

// user_gender enum in the live schema is 'mens' | 'ladies' (see
// database.types.ts). The previous version of these tests asserted against
// 'female'/'male' — values that never existed in the enum — which masked
// that ladies always mapped to 'mens' (#1053).
describe('teeGenderOf', () => {
  it('returns "ladies" for "ladies"', () => {
    expect(teeGenderOf('ladies')).toBe('ladies');
  });
  it('returns "mens" for "mens"', () => {
    expect(teeGenderOf('mens')).toBe('mens');
  });
  it('returns "mens" for null (gender not answered)', () => {
    expect(teeGenderOf(null)).toBe('mens');
  });
});
