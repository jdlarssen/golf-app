import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
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

/**
 * #2206: the "may we send the user to this path?" rule has one home. A new
 * hand-written `startsWith('/')` / `startsWith('//')` check anywhere in the
 * app turns this red; call `safeInternalPath` instead.
 */
describe('one home', () => {
  const ROOT = join(__dirname, '..', '..');
  const DIRS = ['app', 'lib', 'components'];
  const HOME = 'lib/url/safeInternalPath.ts';
  const HAND_ROLLED = /\.startsWith\(\s*['"]\/{1,2}['"]\s*\)/;

  function sourceFiles(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        return entry.name === 'node_modules' ? [] : sourceFiles(path);
      }
      return /\.(ts|tsx)$/.test(entry.name) && !/\.(test|spec)\.tsx?$/.test(entry.name)
        ? [path]
        : [];
    });
  }

  it('no source file outside the helper hand-rolls the internal-path check', () => {
    const offenders = DIRS.flatMap((dir) => sourceFiles(join(ROOT, dir)))
      .map((path) => relative(ROOT, path))
      .filter((path) => path !== HOME)
      .filter((path) => HAND_ROLLED.test(readFileSync(join(ROOT, path), 'utf8')));
    expect(offenders).toEqual([]);
  });
});
