#!/usr/bin/env node
/**
 * Weekly release bookkeeping (#1562).
 *
 *   node scripts/weekly-release.mjs [--dry-run] [--root <dir>] [--summary-json <file>]
 *
 * Every user-visible commit drops a note file in `.changes/` instead of touching
 * `package.json` and `CHANGELOG.md` — two files every PR used to edit, which made
 * rebase conflicts between parallel sessions systematic. Once a week this script
 * folds all the notes into ONE version bump and one batch of CHANGELOG entries.
 *
 * What it does, in order:
 *   1. Read every note under `.changes/` (README.md excluded — it is the template).
 *   2. Validate all of them. One bad file fails the whole run: a partial release
 *      would silently drop somebody's entry.
 *   3. Pick the bump — at least one `feat` note → minor, otherwise patch.
 *   4. Render ONE week block at the top of `## Ukeslipp`: a `### X.Y.Z · <dato>`
 *      heading, the week's feat notes as Funksjon rows, then every fix/perf note
 *      in a single «N rettinger» drawer (#1702).
 *   5. Delete the notes it read — and only those, so a note merged while the
 *      release PR is open survives to next week.
 *
 * Git and PR work deliberately live in `.github/scripts/ukesversjon.sh`: this file
 * touches nothing but the working tree, so the render logic is unit-testable and
 * `--dry-run` is safe to run anywhere.
 *
 * Format reference: docs/changelog-conventions.md. Note template: .changes/README.md.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export const NOTES_DIR = '.changes';
const ISSUE_URL = 'https://github.com/jdlarssen/golf-app/issues';
const ALLOWED_KEYS = ['type', 'issue', 'title', 'link', 'cta'];
const TYPES = ['feat', 'fix', 'perf'];
const MAX_TITLE = 120;
const MAX_CTA = 40;
const MAX_BODY = 400;

// Every release lands as one block under this anchor, newest first. Everything
// from before the weekly rhythm sits folded below it — see CHANGELOG.md.
const WEEK_HEADING = '## Ukeslipp';

// ── Notes ────────────────────────────────────────────────────────────────────

/**
 * Parse one note file. Always returns a note object; problems land in `.errors`
 * (each prefixed with the filename so the fail-closed alert issue is actionable).
 */
export function parseNote(file, raw) {
  const errors = [];
  const note = { file, type: undefined, issues: [], title: undefined, link: undefined, cta: undefined, body: '' };
  const lines = String(raw).replace(/^﻿/, '').split('\n');

  if (lines[0]?.trim() !== '---') {
    errors.push(`${file}: mangler frontmatter — fila må starte med en «---»-linje (mal: .changes/README.md)`);
    return { ...note, errors };
  }
  const end = lines.indexOf('---', 1);
  if (end === -1) {
    errors.push(`${file}: frontmatter er ikke lukket med en «---»-linje (mal: .changes/README.md)`);
    return { ...note, errors };
  }

  const seen = new Set();
  for (const line of lines.slice(1, end)) {
    if (line.trim() === '') continue;
    const at = line.indexOf(':');
    if (at === -1) {
      errors.push(`${file}: «${line.trim()}» er ikke på formen «nøkkel: verdi»`);
      continue;
    }
    const key = line.slice(0, at).trim();
    const value = line.slice(at + 1).trim();
    if (!ALLOWED_KEYS.includes(key)) {
      errors.push(`${file}: ukjent frontmatter-nøkkel «${key}» (tillatt: ${ALLOWED_KEYS.join(', ')})`);
      continue;
    }
    if (seen.has(key)) {
      errors.push(`${file}: «${key}» står flere ganger`);
      continue;
    }
    seen.add(key);

    if (key === 'issue') {
      for (const part of value.split(',')) {
        const num = part.trim().replace(/^#/, '');
        if (!/^\d+$/.test(num)) {
          errors.push(
            `${file}: «issue» må være ett tall eller en kommaliste (f.eks. «1539, 1551») — fikk «${value}»`,
          );
          break;
        }
        note.issues.push(Number(num));
      }
    } else {
      note[key] = value;
    }
  }

  note.body = lines
    .slice(end + 1)
    .join('\n')
    .trim()
    .replace(/\s*\n\s*/g, ' ');

  errors.push(...checkFields(note));
  return { ...note, errors };
}

/** Field rules from docs/changelog-conventions.md, applied to one parsed note. */
function checkFields(note) {
  const { file } = note;
  const errors = [];

  if (!note.type) {
    errors.push(`${file}: mangler «type» (${TYPES.join(' | ')})`);
  } else if (!TYPES.includes(note.type)) {
    errors.push(`${file}: «type: ${note.type}» må være ${TYPES.join(', ')}`);
  }

  if (!note.body) {
    errors.push(`${file}: mangler brødtekst — én setning på Jørgen-språk etter frontmatteren`);
  } else if (note.body.length > MAX_BODY) {
    errors.push(`${file}: brødteksten er ${note.body.length} tegn — grensa er ${MAX_BODY}`);
  }

  const isFeat = note.type === 'feat';
  if (isFeat && !note.title) errors.push(`${file}: feat-notat mangler «title»`);
  if (!isFeat && note.type && (note.title || note.link || note.cta)) {
    errors.push(`${file}: «title», «link» og «cta» hører kun til feat-notater`);
  }
  if (note.title && note.title.length > MAX_TITLE) {
    errors.push(`${file}: «title» er ${note.title.length} tegn — grensa er ${MAX_TITLE}`);
  }
  if (note.cta && note.cta.length > MAX_CTA) {
    errors.push(`${file}: «cta» er ${note.cta.length} tegn — grensa er ${MAX_CTA}`);
  }
  // The ↳-line is all-or-nothing: a link without a button label (or the reverse)
  // cannot be published as an in-app launch.
  if (note.link && !note.cta) errors.push(`${file}: «link» krever «cta» — ta med begge, eller ingen av dem`);
  if (note.cta && !note.link) errors.push(`${file}: «cta» krever «link» — ta med begge, eller ingen av dem`);
  if (note.link && !note.link.startsWith('/')) {
    errors.push(`${file}: «link» må være intern og starte med «/» — fikk «${note.link}»`);
  }

  return errors;
}

/** Every validation error across a set of notes, in file order. */
export function validateNotes(notes) {
  return notes.flatMap((note) => note.errors ?? []);
}

/** Read `.changes/`, skipping the template. Missing directory = empty week. */
export function readNotes(dir) {
  const errors = [];
  const notes = [];
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch (err) {
    if (err.code === 'ENOENT') return { notes: [], errors: [] };
    throw err;
  }

  for (const entry of entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
    const name = entry.name;
    if (name === 'README.md' || name.startsWith('.')) continue;
    if (!entry.isFile()) {
      errors.push(`${name}: er ikke en fil — .changes/ tar bare notatfiler`);
      continue;
    }
    if (!name.endsWith('.md')) {
      errors.push(`${name}: mangler .md-endelse — notater heter «<issue>-<slug>.md» (mal: .changes/README.md)`);
      continue;
    }
    notes.push(parseNote(name, readFileSync(path.join(dir, name), 'utf8')));
  }

  return { notes, errors };
}

// ── Version ──────────────────────────────────────────────────────────────────

/** One feat in the week lifts it to a minor; a fix/perf-only week is a patch. */
export function chooseBump(notes) {
  if (notes.length === 0) throw new Error('ingen notatfiler — en tom uke skal ikke gi en versjon');
  return notes.some((note) => note.type === 'feat') ? 'minor' : 'patch';
}

export function nextVersion(current, bump) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(String(current).trim());
  if (!match) throw new Error(`klarte ikke lese gjeldende versjon «${current}» (forventet X.Y.Z)`);
  const [major, minor, patch] = match.slice(1).map(Number);
  if (bump === 'minor') return `${major}.${minor + 1}.0`;
  if (bump === 'patch') return `${major}.${minor}.${patch + 1}`;
  throw new Error(`ukjent bump-type «${bump}»`);
}

/** The release day in Norwegian long form, in Oslo time — Actions and Vercel both run UTC. */
export function weekLabel(date) {
  return new Intl.DateTimeFormat('nb-NO', {
    timeZone: 'Europe/Oslo',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

// ── Rendering ────────────────────────────────────────────────────────────────

function issueLinks(issues) {
  return issues.map((n) => `[#${n}](${ISSUE_URL}/${n})`).join(', ');
}

/** A Funksjon row: the four launch fields, ready to paste into /admin/lanseringer. */
export function renderFeatureBlock(note) {
  const links = issueLinks(note.issues);
  const lines = [
    '<details>',
    `<summary><strong>${note.title}</strong></summary>`,
    '',
    links ? `${links} — ${note.body}` : note.body,
  ];
  if (note.link) lines.push('', `↳ ${note.link} · «${note.cta}»`);
  lines.push('</details>');
  return lines.join('\n');
}

/** One line in the week's rettinger drawer. The week heading carries the version. */
export function renderFixLine(note) {
  const links = issueLinks(note.issues);
  return links ? `- ${links} — ${note.body}` : `- ${note.body}`;
}

const byFile = (a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0);

/**
 * One week's whole entry: the heading, a Funksjon row per feat note, and every
 * fix/perf note gathered in a single drawer.
 *
 * The drawer summary deliberately skips `<strong>` — that is what tells a
 * Funksjon row apart from table content, both for the eye and for Utroperen,
 * which never proposes a retting as a launch (docs/loops/utroperen.md).
 */
export function renderWeekBlock({ version, notes, now }) {
  const ordered = [...notes].sort(byFile);
  const featureNotes = ordered.filter((note) => note.type === 'feat');
  const fixNotes = ordered.filter((note) => note.type === 'fix' || note.type === 'perf');

  const lines = [`### ${version} · ${weekLabel(now)}`];
  for (const note of featureNotes) lines.push('', ...renderFeatureBlock(note).split('\n'));

  if (fixNotes.length > 0) {
    const count = `${fixNotes.length} ${fixNotes.length === 1 ? 'retting' : 'rettinger'}`;
    lines.push(
      '',
      '<details>',
      `<summary>${count}</summary>`,
      '',
      ...fixNotes.map((note) => renderFixLine(note)),
      '</details>',
    );
  }

  return lines.join('\n');
}

function headingIndex(lines, heading) {
  const hits = lines.reduce((acc, line, i) => (line === heading ? [...acc, i] : acc), []);
  if (hits.length !== 1) {
    throw new Error(`fant ${hits.length} «${heading}»-overskrifter i CHANGELOG.md — forventet nøyaktig én`);
  }
  const at = hits[0];
  if (lines[at + 1] !== '') throw new Error(`forventet en tom linje rett under «${heading}» i CHANGELOG.md`);
  return at;
}

/**
 * Insert the week's block into CHANGELOG.md, newest first under `## Ukeslipp`.
 * Returns the new text plus the edit that produced it, so `--dry-run` can print
 * a tight diff instead of a 3000-line whole-file comparison.
 */
export function applyToChangelog(changelog, { version, notes, now }) {
  const lines = changelog.split('\n');
  const at = headingIndex(lines, WEEK_HEADING);

  // One release, one block. A second block for the same version can only come
  // from hand-editing — but a silent duplicate is worse than a failed run (I3).
  const existing = `### ${version} · `;
  if (lines.some((line) => line.startsWith(existing))) {
    throw new Error(`CHANGELOG.md har allerede en blokk for ${version} — skriver ingenting`);
  }

  const block = renderWeekBlock({ version, notes, now });
  const edits = [{ line: at + 2, removed: [], added: [...block.split('\n'), ''] }];
  return { text: applyEdits(lines, edits), edits };
}

function applyEdits(lines, edits) {
  const out = [];
  let cursor = 0;
  for (const edit of edits) {
    out.push(...lines.slice(cursor, edit.line));
    const actual = lines.slice(edit.line, edit.line + edit.removed.length);
    if (actual.join('\n') !== edit.removed.join('\n')) {
      throw new Error('CHANGELOG.md endret seg under rendering — avbryter uten å skrive');
    }
    out.push(...edit.added);
    cursor = edit.line + edit.removed.length;
  }
  out.push(...lines.slice(cursor));
  return out.join('\n');
}

/** Unified-ish diff of the edits, for `--dry-run` and for the PR body. */
export function renderDiff(originalText, edits, context = 3) {
  const lines = originalText.split('\n');
  const out = [];
  for (const edit of edits) {
    const from = Math.max(0, edit.line - context);
    const to = Math.min(lines.length, edit.line + edit.removed.length + context);
    out.push(`@@ CHANGELOG.md linje ${edit.line + 1} @@`);
    for (const line of lines.slice(from, edit.line)) out.push(` ${line}`);
    for (const line of edit.removed) out.push(`-${line}`);
    for (const line of edit.added) out.push(`+${line}`);
    for (const line of lines.slice(edit.line + edit.removed.length, to)) out.push(` ${line}`);
  }
  return out.join('\n');
}

// ── Plan ─────────────────────────────────────────────────────────────────────

class ValidationError extends Error {
  constructor(errors) {
    super(`ugyldige notatfiler:\n  • ${errors.join('\n  • ')}`);
    this.name = 'ValidationError';
    this.errors = errors;
  }
}

/**
 * Everything the week's release needs, computed without writing anything.
 * Returns null for an empty week. Throws ValidationError on a bad note.
 */
export function planRelease({ root = process.cwd(), now = new Date() } = {}) {
  const notesDir = path.join(root, NOTES_DIR);
  const { notes, errors: readErrors } = readNotes(notesDir);
  if (notes.length === 0 && readErrors.length === 0) return null;

  const errors = [...readErrors, ...validateNotes(notes)];
  if (errors.length > 0) throw new ValidationError(errors);

  const packagePath = path.join(root, 'package.json');
  const currentVersion = JSON.parse(readFileSync(packagePath, 'utf8')).version;
  const bump = chooseBump(notes);
  const version = nextVersion(currentVersion, bump);

  const changelogPath = path.join(root, 'CHANGELOG.md');
  const before = readFileSync(changelogPath, 'utf8');
  const { text, edits } = applyToChangelog(before, { version, notes, now });

  return {
    root,
    bump,
    currentVersion,
    version,
    notes,
    noteFiles: notes.map((note) => path.join(notesDir, note.file)),
    packagePath,
    changelogPath,
    changelogBefore: before,
    changelogAfter: text,
    edits,
  };
}

// ── CLI ──────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = { dryRun: false, root: process.cwd(), summaryJson: undefined };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--root') args.root = path.resolve(argv[++i]);
    else if (arg === '--summary-json') args.summaryJson = path.resolve(argv[++i]);
    else throw new Error(`ukjent argument «${arg}» (bruk: --dry-run, --root <dir>, --summary-json <fil>)`);
  }
  return args;
}

function writeSummary(file, summary) {
  if (file) writeFileSync(file, `${JSON.stringify(summary, null, 2)}\n`);
}

function describe(plan) {
  const kinds = plan.notes.map((note) => `${note.type}: ${note.file}`).join('\n  ');
  return `Bump: ${plan.bump} (${plan.currentVersion} → ${plan.version})\nNotater (${plan.notes.length}):\n  ${kinds}`;
}

function main(argv) {
  const args = parseArgs(argv);
  let plan;
  try {
    plan = planRelease({ root: args.root });
  } catch (err) {
    console.error(`FAIL-CLOSED: ${err.message}`);
    writeSummary(args.summaryJson, { released: false, failed: true, errors: err.errors ?? [err.message] });
    return 1;
  }

  if (!plan) {
    console.log('Ukesversjon: ingen notatfiler i .changes/ — ingen versjon denne uka.');
    writeSummary(args.summaryJson, { released: false, reason: 'ingen notatfiler' });
    return 0;
  }

  console.log(describe(plan));
  console.log('');
  console.log(renderDiff(plan.changelogBefore, plan.edits));

  if (args.dryRun) {
    console.log('\n(--dry-run: ingenting skrevet, ingen notater slettet)');
    writeSummary(args.summaryJson, { released: false, dryRun: true, version: plan.version, bump: plan.bump });
    return 0;
  }

  // npm owns the version field; we only assert it landed where we predicted (I3 —
  // a silent no-op here would ship a CHANGELOG whose versions do not exist.)
  execFileSync('npm', ['version', plan.bump, '--no-git-tag-version'], { cwd: plan.root, stdio: 'inherit' });
  const applied = JSON.parse(readFileSync(plan.packagePath, 'utf8')).version;
  if (applied !== plan.version) {
    console.error(`FAIL-CLOSED: npm version ga ${applied}, forventet ${plan.version} — skriver ingenting.`);
    writeSummary(args.summaryJson, { released: false, failed: true, errors: [`npm version ga ${applied}`] });
    return 1;
  }
  const lockPath = path.join(plan.root, 'package-lock.json');
  if (existsSync(lockPath) && JSON.parse(readFileSync(lockPath, 'utf8')).version !== plan.version) {
    console.error(`FAIL-CLOSED: package-lock.json ble ikke oppdatert til ${plan.version}.`);
    writeSummary(args.summaryJson, { released: false, failed: true, errors: ['package-lock.json er ute av synk'] });
    return 1;
  }

  writeFileSync(plan.changelogPath, plan.changelogAfter);
  for (const file of plan.noteFiles) rmSync(file);

  console.log(`\nUkesversjon: ${plan.version} skrevet, ${plan.noteFiles.length} notatfil(er) slettet.`);
  writeSummary(args.summaryJson, {
    released: true,
    version: plan.version,
    bump: plan.bump,
    noteCount: plan.notes.length,
    featCount: plan.notes.filter((note) => note.type === 'feat').length,
  });
  return 0;
}

// Only run when invoked directly — importing this file (tests) must have no effect.
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  process.exit(main(process.argv.slice(2)));
}
