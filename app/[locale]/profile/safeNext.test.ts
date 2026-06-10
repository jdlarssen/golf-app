import { describe, it, expect } from 'vitest';
import { safeNextPath } from './safeNext';

describe('safeNextPath', () => {
  it('returns a valid same-origin path unchanged', () => {
    expect(safeNextPath('/games/abc-123')).toBe('/games/abc-123');
  });

  it('preserves query strings and fragments on the path', () => {
    expect(safeNextPath('/games/abc?step=2#top')).toBe('/games/abc?step=2#top');
  });

  it('rejects null', () => {
    expect(safeNextPath(null)).toBeNull();
  });

  it('rejects undefined', () => {
    expect(safeNextPath(undefined)).toBeNull();
  });

  it('rejects the empty string', () => {
    expect(safeNextPath('')).toBeNull();
  });

  it('rejects protocol-relative URLs (//evil.com/x)', () => {
    expect(safeNextPath('//evil.com/x')).toBeNull();
  });

  it('rejects absolute http URLs', () => {
    expect(safeNextPath('http://evil.com/x')).toBeNull();
  });

  it('rejects absolute https URLs', () => {
    expect(safeNextPath('https://evil.com/x')).toBeNull();
  });

  it('rejects relative paths without leading slash', () => {
    expect(safeNextPath('games/abc')).toBeNull();
  });

  it('rejects fragment-only values', () => {
    expect(safeNextPath('#top')).toBeNull();
  });

  it('rejects non-string input (defensive)', () => {
    expect(safeNextPath(123 as unknown as string)).toBeNull();
  });
});
