#!/usr/bin/env node
/**
 * Validate the `.changes/` notes a commit stages (#2256).
 *
 *   node scripts/check-changes-notes.mjs
 *
 * Called by `.githooks/commit-msg` for every commit that stages a note, new or
 * changed. It reads each note as it stands in the index (`git show :<path>`),
 * not the working tree, so the check sees exactly what gets committed.
 *
 * The rules are the weekly release's own (`parseNote` in
 * scripts/weekly-release.mjs): one home, no copy. Before this, the hook only
 * checked that a note existed, and two feat notes without `title` reached main
 * and would have stopped Monday's release.
 *
 * Exit 0 = every staged note is valid (or none is staged). Exit 1 = errors on
 * stderr, one per line, prefixed with the file name.
 */
import { execFileSync } from 'node:child_process';
import path from 'node:path';

import { parseNote } from './weekly-release.mjs';

/** A staged note path: a file directly under .changes/, not the template. */
const NOTE_PATH = /^\.changes\/[^/]+\.md$/;
const TEMPLATE = '.changes/README.md';

/** Every error across the given notes, with the weekly release's rules. */
export function checkNotes(notes) {
  return notes.flatMap(({ file, raw }) => parseNote(file, raw).errors);
}

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8' });
}

function stagedNotes() {
  return git(['diff', '--cached', '--name-only', '--diff-filter=AM'])
    .split('\n')
    .filter((p) => NOTE_PATH.test(p) && p !== TEMPLATE)
    .map((p) => ({ file: path.basename(p), raw: git(['show', `:${p}`]) }));
}

function main() {
  const errors = checkNotes(stagedNotes());
  for (const error of errors) console.error(`  • ${error}`);
  return errors.length === 0 ? 0 : 1;
}

// Only when run as a script; importing (the test) runs nothing.
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  process.exit(main());
}
