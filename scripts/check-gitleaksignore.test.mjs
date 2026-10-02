// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { findStale, parseIgnoreFile } from './check-gitleaksignore.mjs';

// Type-A tests for the .gitleaksignore guard (#2470). A fingerprint pins one
// commit SHA, and rebase-merge rewrites PR SHAs, so a fingerprint taken on a
// PR branch is dead on main. Both directions matter: a dead line must be
// caught, and comments and live lines must pass.

const ON_MAIN = 'a'.repeat(40);
const PR_ONLY = 'b'.repeat(40);

const FILE = [
  '# One-off historical findings accepted by fingerprint.',
  '',
  `${ON_MAIN}:docs/notes.md:generic-api-key:12`,
  '  # indented comment',
  `${PR_ONLY}:native/app/src/data/pushDevice.test.ts:generic-api-key:27`,
].join('\n');

describe('parseIgnoreFile', () => {
  it('skips blank lines and comments and keeps the line numbers', () => {
    const { fingerprints, malformed } = parseIgnoreFile(FILE);
    expect(malformed).toEqual([]);
    expect(fingerprints.map((fp) => [fp.lineNumber, fp.sha, fp.file])).toEqual([
      [3, ON_MAIN, 'docs/notes.md'],
      [5, PR_ONLY, 'native/app/src/data/pushDevice.test.ts'],
    ]);
  });

  it.each([
    ['a short SHA', 'c2ea6835b:native/app/x.test.ts:generic-api-key:27'],
    ['no line number', `${ON_MAIN}:docs/notes.md:generic-api-key`],
    ['a bare path', 'docs/notes.md'],
  ])('reports %s as malformed', (_label, line) => {
    expect(parseIgnoreFile(line).malformed).toEqual([{ lineNumber: 1, raw: line }]);
  });
});

describe('findStale', () => {
  const { fingerprints } = parseIgnoreFile(FILE);

  it('returns only the fingerprints whose commit is not on main', () => {
    const stale = findStale(fingerprints, (sha) => sha === ON_MAIN);
    expect(stale.map((fp) => fp.sha)).toEqual([PR_ONLY]);
  });

  it('returns nothing when every commit is on main', () => {
    expect(findStale(fingerprints, () => true)).toEqual([]);
  });
});
