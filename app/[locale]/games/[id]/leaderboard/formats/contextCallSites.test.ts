import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * Source sweep over the leaderboard format route modules (#1958).
 *
 * Six route modules in this folder built their ScoringContext inline and lost
 * the withdrawn-player filter on the way: the live board kept counting a player
 * the result builder had already taken out, so the same game showed one
 * standing during the round and another in the summary. The filter has one
 * home — `lib/scoring/context/build*Context.ts` (#1831) — and this sweep keeps
 * route modules from growing their own copy again.
 *
 * It reads the folder instead of a hand-kept file list, so a new format module
 * is covered the moment it lands (#1993/#1845). The checks are textual: they
 * catch a reintroduction of the exact pattern that shipped, not every possible
 * rewrite of it.
 */

const FORMATS_DIR = __dirname;

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(path, out);
    } else if (
      (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) &&
      !entry.name.endsWith('.test.ts') &&
      !entry.name.endsWith('.test.tsx')
    ) {
      out.push(path);
    }
  }
  return out;
}

const SOURCES = walk(FORMATS_DIR)
  .sort()
  .map((file) => ({
    name: relative(FORMATS_DIR, file),
    source: readFileSync(file, 'utf8'),
  }));

function lineOf(source: string, index: number): number {
  return source.slice(0, index).split('\n').length;
}

function matchIndexes(source: string, pattern: RegExp): Array<{ index: number; length: number }> {
  const re = new RegExp(pattern.source, 'g');
  const out: Array<{ index: number; length: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) out.push({ index: m.index, length: m[0].length });
  return out;
}

describe('leaderboard format modules build scoring context through the shared builders (#1958)', () => {
  it('reads the format route modules (a sweep over nothing is vacuously green)', () => {
    expect(
      SOURCES.map((s) => s.name),
      'The sweep found no stableford.tsx next to it — was the test moved out of formats/?',
    ).toContain('stableford.tsx');
  });

  it('rule 1: no route module builds a ScoringContext inline', () => {
    const violations: string[] = [];
    for (const { name, source } of SOURCES) {
      for (const m of matchIndexes(source, /flightNumber:/)) {
        violations.push(`${name}:${lineOf(source, m.index)}: inline ScoringContext (flightNumber:)`);
      }
    }
    expect(
      violations,
      'Rule 1 — a format route module builds its ScoringContext inline. Build it with ' +
        'the shared helper in lib/scoring/context/ (buildUniformContext for the team, ' +
        'matchplay and scramble modes) instead: inline mappings are where the ' +
        'withdrawn-player filter went missing (#1958). The check is textual and also ' +
        'matches comments — if it hits a comment, reword the comment, not the gate.',
    ).toEqual([]);
  });

  it('rule 2: every users-filter on players also filters withdrawn players', () => {
    const WINDOW = 60;
    const violations: string[] = [];
    for (const { name, source } of SOURCES) {
      for (const m of matchIndexes(source, /p\.users\s*!=\s*null/)) {
        const after = source
          .slice(m.index + m.length, m.index + m.length + WINDOW * 4)
          .replace(/\s+/g, ' ')
          .slice(0, WINDOW);
        if (!after.includes('p.withdrawn_at')) {
          violations.push(
            `${name}:${lineOf(source, m.index)}: p.users != null without p.withdrawn_at`,
          );
        }
      }
    }
    expect(
      violations,
      'Rule 2 — a player list is filtered on `p.users != null` without also dropping ' +
        'withdrawn players. Pair it with `p.withdrawn_at == null`, as the reveal branch in ' +
        'stableford.tsx does (#1958). This is a canary for the exact pattern that shipped, ' +
        'not a proof: another parameter name or an extracted helper passes unseen.',
    ).toEqual([]);
  });

  it('rule 3: a reveal brutto branch mentions withdrawn players', () => {
    const violations: string[] = [];
    for (const { name, source } of SOURCES) {
      if (/mode:\s*'brutto'/.test(source) && !source.includes('withdrawn')) {
        violations.push(`${name}: reveal brutto branch without a withdrawn filter`);
      }
    }
    expect(
      violations,
      'Rule 3 — this module builds its own brutto list for the reveal board but never ' +
        'mentions withdrawn players. That branch bypasses the context builder, so it must ' +
        'drop withdrawn players and their scores itself — see the withdrawnIdsSet in ' +
        'stableford.tsx (#1958). Canary only: it proves the word is in the file, nothing more. ' +
        'The `withdrawn_at` field in the opts type alone satisfies it, so it only guards a ' +
        'module that never declares that field — see #2058 for turning it into a real gate.',
    ).toEqual([]);
  });
});
