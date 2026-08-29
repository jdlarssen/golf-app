// @vitest-environment node
import { describe, expect, it } from 'vitest';

import {
  classifyRef,
  extractRefs,
  isSkippableRef,
  stripFencedBlocks,
} from './check-doc-paths.mjs';

// Type-A unit tests for C7's path classifier (#1554). The scanner's whole value
// is the filtering: a naive version reported 96 "broken" paths of which all 96
// were noise, so both directions matter — every real break must fire, and every
// non-path must not.

/** Repo stand-in: `exists` answers from a fixed set of repo-root-relative paths. */
const REPO = new Set([
  'docs',
  'docs/user-flows.md',
  'docs/agent-discipline',
  'docs/agent-discipline/procedures',
  'docs/agent-discipline/procedures/task-intake.md',
  'lib',
  'lib/scoring',
  'lib/notifications/types.ts',
  'supabase',
  'supabase/migrations',
]);
const exists = (relative) => REPO.has(relative);

describe('isSkippableRef', () => {
  it.each([
    ['a bare word with no slash', 'status'],
    ['a URL route', '/admin/games/[id]'],
    ['a slash command', '/forge:auto'],
    ['a scoped npm specifier', '@supabase/ssr'],
    ['a git ref', 'origin/main'],
    ['a branch-name pattern', 'claude/dok-skjema-oppdatering'],
    ['a glob', 'docs/flows/*-fremtid.svg'],
    ['a filename placeholder', '.changes/<issue>-<slug>.md'],
    ['a command fragment', 'npm run gen:types'],
  ])('skips %s', (_label, ref) => {
    expect(isSkippableRef(ref)).toBe(true);
  });

  it.each([
    ['a repo-root path', 'docs/user-flows.md'],
    ['a doc-relative path', 'procedures/task-intake.md'],
    ['a directory reference', 'lib/scoring/'],
  ])('does not skip %s', (_label, ref) => {
    expect(isSkippableRef(ref)).toBe(false);
  });
});

describe('classifyRef', () => {
  it('accepts an existing repo-root path', () => {
    expect(classifyRef('docs/user-flows.md', '', exists)).toEqual({
      verdict: 'ok',
      resolved: 'docs/user-flows.md',
    });
  });

  it('accepts a directory reference written with a trailing slash', () => {
    expect(classifyRef('lib/scoring/', '', exists)).toEqual({
      verdict: 'ok',
      resolved: 'lib/scoring',
    });
  });

  it('resolves a path doc-relative when it does not exist from the root', () => {
    // `docs/agent-discipline/README.md` cites its siblings as `procedures/…`.
    expect(classifyRef('procedures/task-intake.md', 'docs/agent-discipline', exists)).toEqual({
      verdict: 'ok',
      resolved: 'docs/agent-discipline/procedures/task-intake.md',
    });
  });

  it('resolves an extensionless module ref by trying .ts', () => {
    expect(classifyRef('lib/notifications/types', '', exists)).toEqual({
      verdict: 'ok',
      resolved: 'lib/notifications/types.ts',
    });
  });

  it('reports a missing file whose last segment has an extension', () => {
    expect(classifyRef('docs/gone.md', '', exists)).toEqual({ verdict: 'broken' });
  });

  it('reports a missing directory written with a trailing slash', () => {
    expect(classifyRef('docs/gone/', '', exists)).toEqual({ verdict: 'broken' });
  });

  it('treats a prose enumeration as prose, not a missing directory', () => {
    // `docs/refactor/test/chore/style/ci/build` lists commit prefixes. The first
    // segment is a real directory, so it survives the candidate gate — the
    // extension rule is what keeps it out of the broken list.
    expect(classifyRef('docs/refactor/test/chore/style/ci/build', '', exists)).toEqual({
      verdict: 'skip',
    });
  });

  it('skips a path whose first segment is not a repo-root entry', () => {
    // The candidate gate is what keeps command fragments out: nothing in the
    // repo root is called `gh api repos`, so this is never a path question.
    expect(classifyRef('nonexistent-root/whatever.md', '', exists)).toEqual({
      verdict: 'skip',
    });
  });

  it.each([
    ['/login', ''],
    ['@supabase/ssr', ''],
    ['origin/main', ''],
    ['/forge:auto', ''],
  ])('skips %s before touching the filesystem', (ref, docDir) => {
    expect(
      classifyRef(ref, docDir, () => {
        throw new Error('exists() must not be consulted for a non-path ref');
      }),
    ).toEqual({ verdict: 'skip' });
  });
});

describe('extractRefs', () => {
  it('picks up inline code spans', () => {
    expect(extractRefs('Se `docs/user-flows.md` og `lib/scoring/`.')).toEqual([
      'docs/user-flows.md',
      'lib/scoring/',
    ]);
  });

  it('unwraps the double-backtick form used to show a backticked path', () => {
    expect(extractRefs('For hver `` `sti` ``-referanse.')).toEqual(['sti']);
  });

  it('ignores fenced code blocks', () => {
    const markdown = [
      'Kjør dette:',
      '```bash',
      'gh api repos/$REPO/issues/1110/comments',
      '```',
      'og les `docs/user-flows.md`.',
    ].join('\n');

    expect(extractRefs(markdown)).toEqual(['docs/user-flows.md']);
  });
});

describe('stripFencedBlocks', () => {
  it('drops the fence lines along with their contents', () => {
    expect(stripFencedBlocks('a\n```\nhidden\n```\nb')).toBe('a\nb');
  });
});
