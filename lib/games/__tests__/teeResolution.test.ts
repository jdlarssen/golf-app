import { describe, it, expect } from 'vitest';
import { resolvePlayerTeeId } from '../teeResolution';

describe('resolvePlayerTeeId', () => {
  it('returns null when gender is M (uses game default)', () => {
    expect(resolvePlayerTeeId('M', 'ladies-tee-id')).toBe(null);
  });

  it('returns ladies tee id when gender is D and ladies tee is set', () => {
    expect(resolvePlayerTeeId('D', 'ladies-tee-id')).toBe('ladies-tee-id');
  });

  it('returns null when gender is D but no ladies tee is configured', () => {
    expect(resolvePlayerTeeId('D', null)).toBe(null);
  });
});
