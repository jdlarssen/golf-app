import { describe, expect, it } from 'vitest';
import { safeInternalPath } from './safeInternalPath';

describe('safeInternalPath', () => {
  it.each([
    '/',
    '/games/abc-123',
    '/games/abc?step=2#top',
    '/signup/abc12345/team',
    '/en/venner',
    // An encoded backslash is only a path character, never a separator.
    '/games/a%5Cb',
    '/login?next=%2Fgames',
  ])('returns the same-origin path %j unchanged', (path) => {
    expect(safeInternalPath(path)).toBe(path);
  });

  it.each([
    null,
    undefined,
    123,
    '',
    'games/abc',
    '#top',
    ' /games',
    '//evil.example',
    '//evil.com/x',
    '/\\evil.example',
    '/\\/evil.example',
    '\\\\evil.example',
    '/\t/evil.example',
    '/\n/evil.example',
    '/\r/evil.example',
    '/\u0000x',
    '/.//evil.example',
    '/..//evil.example',
    'https://evil.example',
    'https://evil.com/x',
    'http://evil.example/x',
    'http://evil.com/x',
    'javascript:alert(1)',
  ])('rejects %j', (value) => {
    expect(safeInternalPath(value)).toBeNull();
  });
});

