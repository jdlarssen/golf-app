#!/usr/bin/env node
/**
 * Release notes for one weekly release (#2019).
 *
 *   node scripts/release-notes.mjs --version <X.Y.Z>
 *
 * Prints JSON `{ title, notes }` for `.github/scripts/ukeslipp-release.sh`: the
 * week's CHANGELOG.md block verbatim plus a footer line. The block format is
 * owned by weekly-release.mjs (`extractWeekBlock`) — this file only wires it to
 * a CLI, so the release text can never drift from the changelog.
 */

import { readFileSync } from 'node:fs';

import { extractWeekBlock } from './weekly-release.mjs';

const CHANGELOG = new URL('../CHANGELOG.md', import.meta.url);
const FOOTER =
  'Hele changeloggen: [CHANGELOG.md](https://github.com/jdlarssen/golf-app/blob/main/CHANGELOG.md) · Appen: [tornygolf.no](https://tornygolf.no)';

function main(argv) {
  const [flag, version] = argv;
  if (argv.length !== 2 || flag !== '--version' || !version) {
    console.error('bruk: node scripts/release-notes.mjs --version <X.Y.Z>');
    return 1;
  }
  try {
    const { title, notes } = extractWeekBlock(readFileSync(CHANGELOG, 'utf8'), version);
    process.stdout.write(`${JSON.stringify({ title, notes: `${notes}\n\n---\n\n${FOOTER}\n` })}\n`);
    return 0;
  } catch (err) {
    console.error(`release-notes: ${err.message}`);
    return 1;
  }
}

process.exit(main(process.argv.slice(2)));
