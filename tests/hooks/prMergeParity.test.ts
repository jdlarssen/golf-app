import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isUserVisibleByCommits } from '@/lib/loops/autoMerge';

/**
 * Parity between the two homes of the "user-visible PR" rule (#1303, AGENTS.md
 * trap 4): the merge card's `isUserVisibleByCommits` (lib/loops/autoMerge.ts)
 * and the pr-merge-staging deny in `.claude/hooks/bash-guard.sh`.
 *
 * The same commit messages run through both: the TS predicate directly, the
 * hook as a real process with a stubbed `gh pr view` (BASH_GUARD_PR_JSON). The
 * hook must deny exactly when the TS predicate says user-visible. Changing the
 * regex or the [no-changelog] escape in only one file turns this red.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(HERE, '..', '..');
const HOOK = path.join(REPO_ROOT, '.claude', 'hooks', 'bash-guard.sh');
const AUTO_MERGE = path.join(REPO_ROOT, 'lib', 'loops', 'autoMerge.ts');

type Commit = { messageHeadline: string; messageBody: string };

const CORPUS: Commit[] = [
  { messageHeadline: 'feat: add x', messageBody: '' },
  { messageHeadline: 'fix(cup): fail closed', messageBody: 'Refs #1863' },
  { messageHeadline: 'perf(sync): batch writes', messageBody: '' },
  { messageHeadline: 'feat(native)!: breaking', messageBody: '' },
  { messageHeadline: 'FIX: upper case', messageBody: '' },
  { messageHeadline: 'Feat(Scope With Spaces): mixed', messageBody: '' },
  { messageHeadline: '  fix: leading whitespace', messageBody: '' },
  { messageHeadline: 'fix(hooks): internal', messageBody: '[no-changelog]\n\nRefs #1303' },
  { messageHeadline: 'feat: escape in subject [no-changelog]', messageBody: '' },
  { messageHeadline: 'docs(x): a', messageBody: '' },
  { messageHeadline: 'chore: b', messageBody: '' },
  { messageHeadline: 'refactor(y): c', messageBody: '' },
  { messageHeadline: 'test: d', messageBody: '' },
  { messageHeadline: 'fixup! fix: x', messageBody: '' },
  { messageHeadline: 'features: not a type', messageBody: '' },
  { messageHeadline: 'fix x without colon', messageBody: '' },
  { messageHeadline: 'fix(unclosed: x', messageBody: '' },
  { messageHeadline: 'fix()!: empty scope', messageBody: '' },
  { messageHeadline: 'Revert "fix: x"', messageBody: '' },
];

function hookDenies(commit: Commit, tmp: string): boolean {
  const stub = path.join(tmp, 'pr.json');
  fs.writeFileSync(stub, JSON.stringify({ number: 5, labels: [], commits: [commit] }));
  const res = spawnSync('bash', [HOOK], {
    input: JSON.stringify({ tool_input: { command: 'gh pr merge 5 --rebase --delete-branch' } }),
    env: { ...process.env, CLAUDE_PROJECT_DIR: tmp, BASH_GUARD_PR_JSON: stub },
    encoding: 'utf8',
  });
  expect(res.status).toBe(0);
  const out = res.stdout.trim();
  if (!out) return false;
  const parsed = JSON.parse(out);
  // A reminder here means the hook failed open (e.g. jq rejected the regex) —
  // that is a parity break too, not a silent "not user-visible".
  expect(parsed.hookSpecificOutput.additionalContext).toBeUndefined();
  return parsed.hookSpecificOutput.permissionDecision === 'deny';
}

describe('pr-merge-staging parity with isUserVisibleByCommits (#1303)', () => {
  it('uses the same prefix regex source in both files', () => {
    const bashSrc = fs.readFileSync(HOOK, 'utf8').match(/^USER_VISIBLE_PREFIX_RE='([^']*)'$/m)?.[1];
    const tsSrc = fs
      .readFileSync(AUTO_MERGE, 'utf8')
      .match(/^const USER_VISIBLE_PREFIX = \/(.*)\/i;$/m)?.[1];
    expect(bashSrc).toBeDefined();
    expect(tsSrc).toBeDefined();
    expect(bashSrc).toBe(tsSrc);
  });

  it('denies exactly the commits the merge card treats as user-visible', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pr-merge-parity-'));
    try {
      const rows = CORPUS.map((c) => ({
        headline: c.messageHeadline,
        ts: isUserVisibleByCommits([c.messageBody ? `${c.messageHeadline}\n\n${c.messageBody}` : c.messageHeadline]),
        hook: hookDenies(c, tmp),
      }));
      // Both outcomes must be represented, or the corpus proves nothing.
      expect(rows.some((r) => r.ts)).toBe(true);
      expect(rows.some((r) => !r.ts)).toBe(true);
      expect(rows.filter((r) => r.ts !== r.hook)).toEqual([]);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
