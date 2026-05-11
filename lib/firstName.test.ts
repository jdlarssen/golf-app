import { describe, it, expect } from 'vitest';
import { firstName } from './firstName';

describe('firstName', () => {
  it('returns the word before the first space', () => {
    expect(firstName('Sindre Haugen')).toBe('Sindre');
  });
  it('handles single-word names', () => {
    expect(firstName('Sindre')).toBe('Sindre');
  });
  it('handles multi-part names', () => {
    expect(firstName('Jan Erik Solberg')).toBe('Jan');
  });
  it('trims leading whitespace', () => {
    expect(firstName('  Sindre Haugen')).toBe('Sindre');
  });
  it('returns null for empty/whitespace', () => {
    expect(firstName('')).toBeNull();
    expect(firstName('   ')).toBeNull();
  });
  it('returns null for null/undefined input', () => {
    expect(firstName(null)).toBeNull();
    expect(firstName(undefined)).toBeNull();
  });
});
