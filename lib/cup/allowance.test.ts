import { describe, it, expect } from 'vitest';
import { ALLOWANCE_DEFAULTS, parseAllowancePct } from './allowance';

describe('ALLOWANCE_DEFAULTS', () => {
  it('fourball default is 85 (WHS)', () => {
    expect(ALLOWANCE_DEFAULTS.fourball).toBe(85);
  });
  it('foursomes default is 50 (WHS)', () => {
    expect(ALLOWANCE_DEFAULTS.foursomes).toBe(50);
  });
  it('greensome default is 100 (WHS)', () => {
    expect(ALLOWANCE_DEFAULTS.greensome).toBe(100);
  });
  it('chapman default is 100 (WHS)', () => {
    expect(ALLOWANCE_DEFAULTS.chapman).toBe(100);
  });
  it('gruesome default is 50 (WHS)', () => {
    expect(ALLOWANCE_DEFAULTS.gruesome).toBe(50);
  });
});

describe('parseAllowancePct', () => {
  // Empty string → return defaultPct (not a hard-coded value)
  it('empty string returns the given defaultPct (fourball=85)', () => {
    expect(parseAllowancePct('', ALLOWANCE_DEFAULTS.fourball)).toBe(85);
  });
  it('empty string returns the given defaultPct (foursomes=50)', () => {
    expect(parseAllowancePct('', ALLOWANCE_DEFAULTS.foursomes)).toBe(50);
  });
  it('empty string returns the given defaultPct (greensome=100)', () => {
    expect(parseAllowancePct('', ALLOWANCE_DEFAULTS.greensome)).toBe(100);
  });
  it('empty string returns the given defaultPct (chapman=100)', () => {
    expect(parseAllowancePct('', ALLOWANCE_DEFAULTS.chapman)).toBe(100);
  });
  it('empty string returns the given defaultPct (gruesome=50)', () => {
    expect(parseAllowancePct('', ALLOWANCE_DEFAULTS.gruesome)).toBe(50);
  });

  // Whitespace-only → treated as empty
  it('whitespace-only string returns the given defaultPct', () => {
    expect(parseAllowancePct('   ', 75)).toBe(75);
  });

  // Valid integers within range
  it('returns 0 (brutto mode boundary)', () => {
    expect(parseAllowancePct('0', 85)).toBe(0);
  });
  it('returns 100 (full allowance boundary)', () => {
    expect(parseAllowancePct('100', 85)).toBe(100);
  });
  it('returns a mid-range integer', () => {
    expect(parseAllowancePct('75', 85)).toBe(75);
  });

  // Leading/trailing whitespace trimmed
  it('trims surrounding whitespace', () => {
    expect(parseAllowancePct('  85  ', 50)).toBe(85);
  });

  // Out of range → null
  it('returns null for negative values', () => {
    expect(parseAllowancePct('-1', 85)).toBeNull();
  });
  it('returns null for values above 100', () => {
    expect(parseAllowancePct('101', 85)).toBeNull();
  });

  // Non-integer → null
  it('returns null for decimal values', () => {
    expect(parseAllowancePct('85.5', 85)).toBeNull();
  });
  it('returns null for NaN strings', () => {
    expect(parseAllowancePct('abc', 85)).toBeNull();
  });
  it('returns null for empty-after-trim comma string', () => {
    expect(parseAllowancePct(',', 85)).toBeNull();
  });
});
