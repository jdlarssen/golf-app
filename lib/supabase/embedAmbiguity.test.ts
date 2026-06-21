import { it, expect, describe } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  parseSelectEmbeds,
  findAmbiguousEmbeds,
  isAmbiguousPair,
  MULTI_FK_TO_USERS,
} from './embedAmbiguity';

/**
 * Shared regression guard for PGRST201 ambiguous PostgREST embeds (#798).
 *
 * Part 1 unit-tests the classifier; Part 2 is a static sweep of the whole
 * source tree that fails if any unhinted ambiguous `users`-embed is
 * (re)introduced. This is the one place the rule lives — see embedAmbiguity.ts
 * for the schema ground-truth and the regeneration query.
 */

describe('embed-ambiguity classifier', () => {
  it('flags an unhinted users embed on a multi-FK parent', () => {
    expect(findAmbiguousEmbeds('game_players', 'user_id, users(name)')).toEqual([
      { parent: 'game_players', relation: 'users' },
    ]);
  });

  it('accepts an FK-hinted users embed', () => {
    expect(
      findAmbiguousEmbeds(
        'game_players',
        'user_id, users!game_players_user_id_fkey(name, nickname)',
      ),
    ).toEqual([]);
  });

  it('accepts a users embed on a single-FK parent (group_members)', () => {
    expect(
      findAmbiguousEmbeds('group_members', 'user_id, role, users(name, nickname)'),
    ).toEqual([]);
  });

  it('treats `!inner` as a join modifier, not an FK hint (still ambiguous)', () => {
    expect(findAmbiguousEmbeds('group_join_requests', 'users!inner(name)')).toEqual([
      { parent: 'group_join_requests', relation: 'users' },
    ]);
  });

  it('honours a real FK hint even with a trailing `!inner` modifier', () => {
    expect(
      findAmbiguousEmbeds(
        'group_join_requests',
        'users!group_join_requests_user_id_fkey!inner(name)',
      ),
    ).toEqual([]);
  });

  it('parses alias and spread prefixes', () => {
    expect(parseSelectEmbeds('created_by_user:users!courses_created_by_fkey(name)')).toEqual(
      [{ relation: 'users', hint: 'courses_created_by_fkey', children: [] }],
    );
    expect(parseSelectEmbeds('...users(name)')).toEqual([
      { relation: 'users', hint: null, children: [] },
    ]);
  });

  it('checks nested embeds at the correct depth', () => {
    // games->game_players is single-FK (safe); game_players->users is ambiguous.
    expect(
      findAmbiguousEmbeds('games', 'name, game_players(team_number, users(name))'),
    ).toEqual([{ parent: 'game_players', relation: 'users' }]);
  });

  it('flags the reverse direction (users embedding a multi-FK table)', () => {
    expect(findAmbiguousEmbeds('users', 'name, scores(strokes)')).toEqual([
      { parent: 'users', relation: 'scores' },
    ]);
  });

  it('does not split commas inside nested embeds', () => {
    expect(parseSelectEmbeds('a, b(c, d), e')).toEqual([
      { relation: 'b', hint: null, children: [] },
    ]);
  });

  it('knows the ambiguous pairs are exactly users <-> multi-FK tables', () => {
    expect(isAmbiguousPair('users', 'game_players')).toBe(true);
    expect(isAmbiguousPair('game_players', 'users')).toBe(true);
    expect(isAmbiguousPair('users', 'group_members')).toBe(false);
    expect(isAmbiguousPair('game_players', 'games')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Part 2 — repo-wide static guard.
// ---------------------------------------------------------------------------

const SCAN_ROOTS = ['app', 'lib', 'components'];
const REPO_ROOT = join(__dirname, '..', '..');

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.next') continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(path, out);
    } else if (
      (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) &&
      !entry.name.endsWith('.test.ts') &&
      !entry.name.endsWith('.test.tsx') &&
      !entry.name.endsWith('.d.ts')
    ) {
      out.push(path);
    }
  }
  return out;
}

/** Every `.from('table')` occurrence with its character offset. */
function fromOccurrences(source: string): Array<{ index: number; table: string }> {
  const out: Array<{ index: number; table: string }> = [];
  const re = /\.from\(\s*['"]([a-zA-Z_][a-zA-Z0-9_]*)['"]\s*\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) out.push({ index: m.index, table: m[1] });
  return out;
}

/** Reads a string literal beginning at `start` (a quote char), or null. */
function readStringLiteral(source: string, start: number): string | null {
  const quote = source[start];
  if (quote !== "'" && quote !== '"' && quote !== '`') return null;
  let result = '';
  for (let i = start + 1; i < source.length; i++) {
    const ch = source[i];
    if (ch === '\\') {
      result += source[i + 1] ?? '';
      i += 1;
      continue;
    }
    if (ch === quote) return result;
    result += ch;
  }
  return null;
}

/** Every `.select(<string literal>)` with the literal and its `.select(` offset. */
function selectLiterals(source: string): Array<{ index: number; str: string }> {
  const out: Array<{ index: number; str: string }> = [];
  const re = /\.select\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    let i = m.index + m[0].length;
    while (i < source.length && /\s/.test(source[i])) i += 1;
    const literal = readStringLiteral(source, i);
    if (literal !== null) out.push({ index: m.index, str: literal });
  }
  return out;
}

/** The `.from()` table immediately preceding a `.select(` (nearest by offset). */
function nearestFrom(
  froms: Array<{ index: number; table: string }>,
  selectIndex: number,
): string | null {
  let best: { index: number; table: string } | null = null;
  for (const f of froms) {
    if (f.index < selectIndex && (best === null || f.index > best.index)) best = f;
  }
  return best?.table ?? null;
}

function scanRepo(): string[] {
  const violations: string[] = [];
  for (const root of SCAN_ROOTS) {
    for (const file of walk(join(REPO_ROOT, root))) {
      const source = readFileSync(file, 'utf8');
      if (!source.includes('.select(')) continue;
      const froms = fromOccurrences(source);
      for (const sel of selectLiterals(source)) {
        const fromTable = nearestFrom(froms, sel.index);
        if (fromTable === null) continue;
        for (const v of findAmbiguousEmbeds(fromTable, sel.str)) {
          const rel = join(file).replace(REPO_ROOT + '/', '');
          violations.push(`${rel}: .from('${v.parent}') embeds '${v.relation}' without an FK hint`);
        }
      }
    }
  }
  return violations.sort();
}

it('no unhinted ambiguous PostgREST embeds anywhere in the source', () => {
  expect(
    scanRepo(),
    'Found PostgREST embeds between `users` and a table with >1 FK to users, ' +
      'without an explicit FK hint. These crash with PGRST201 at runtime (#798). ' +
      "Add the FK hint, e.g. `users!game_players_user_id_fkey(name)` — see " +
      'lib/supabase/embedAmbiguity.ts and lib/cup/actions.ts for the pattern.',
  ).toEqual([]);
});

// ---------------------------------------------------------------------------
// Part 3 — schema-parity guard: MULTI_FK_TO_USERS must match database.types.ts.
//
// The guard's hand-held pair list cannot drift silently when the schema gains a
// new table with >1 FK to `users`. This test parses the in-repo generated types
// file (lib/database.types.ts) — entirely hermetically, no DB connection needed
// — and asserts the discovered set equals MULTI_FK_TO_USERS exactly.
//
// If this test fails: either
//   (a) the schema gained a new multi-FK table → add it to MULTI_FK_TO_USERS
//       in embedAmbiguity.ts and add the FK-hinted embed everywhere needed, or
//   (b) the types file is stale → run `npm run gen:types` to regenerate it.
// ---------------------------------------------------------------------------

/**
 * Parses lib/database.types.ts and returns the set of public table names that
 * hold more than one foreign key pointing at `users` (i.e. the tables for which
 * a bare `users(...)` embed is ambiguous).
 *
 * Approach: scan the Tables section of the generated types file for each table's
 * Relationships block, count occurrences of `referencedRelation: "users"` per
 * table, and collect those with count > 1.
 *
 * The generated types file has a highly stable, machine-produced format, so
 * regex-based parsing is reliable here.
 */
function deriveMultiFkToUsersFromTypes(): Set<string> {
  const typesPath = join(REPO_ROOT, 'lib', 'database.types.ts');
  const source = readFileSync(typesPath, 'utf8');

  // Extract the Tables section (between `Tables: {` and `Views: {`).
  const tablesStart = source.indexOf('Tables: {');
  const tablesEnd = source.indexOf('Views: {', tablesStart);
  if (tablesStart === -1 || tablesEnd === -1) {
    throw new Error('Could not locate Tables section in lib/database.types.ts');
  }
  const tablesSection = source.slice(tablesStart, tablesEnd);

  // Find each top-level table entry: `      tableName: {`
  // The generated file consistently indents table names with 6 spaces.
  const tablePattern = /^ {6}([a-z_][a-z0-9_]*): \{/gm;
  const multiFkTables = new Set<string>();

  let tableMatch: RegExpExecArray | null;
  const tableEntries: Array<{ name: string; startIndex: number }> = [];
  while ((tableMatch = tablePattern.exec(tablesSection)) !== null) {
    tableEntries.push({ name: tableMatch[1], startIndex: tableMatch.index });
  }

  for (let i = 0; i < tableEntries.length; i++) {
    const { name, startIndex } = tableEntries[i];
    // The table block runs from its start up to the next table (or end of section).
    const blockEnd = i + 1 < tableEntries.length ? tableEntries[i + 1].startIndex : tablesSection.length;
    const block = tablesSection.slice(startIndex, blockEnd);

    // Count how many FKs in this table's Relationships array point to "users".
    const usersRefPattern = /referencedRelation: "users"/g;
    let count = 0;
    while (usersRefPattern.exec(block) !== null) count++;

    if (count > 1) multiFkTables.add(name);
  }

  return multiFkTables;
}

describe('schema-parity: MULTI_FK_TO_USERS matches database.types.ts', () => {
  it('derives the same multi-FK-to-users tables as the hand-held list', () => {
    const schemaSet = deriveMultiFkToUsersFromTypes();
    const guardSet = new Set(MULTI_FK_TO_USERS);

    // Tables in schema but missing from the guard list — guard is blind to them.
    const missing = [...schemaSet].filter((t) => !guardSet.has(t)).sort();
    // Tables in guard list but not found in schema — stale entries.
    const extra = [...guardSet].filter((t) => !schemaSet.has(t)).sort();

    expect(
      { missing, extra },
      missing.length > 0
        ? `MULTI_FK_TO_USERS is missing tables that have >1 FK to \`users\` in ` +
            `lib/database.types.ts: ${missing.join(', ')}. Add them to MULTI_FK_TO_USERS ` +
            `in lib/supabase/embedAmbiguity.ts and add FK-hinted embeds wherever needed (#798).`
        : extra.length > 0
          ? `MULTI_FK_TO_USERS contains tables not found as multi-FK in lib/database.types.ts: ` +
              `${extra.join(', ')}. Either the types file is stale (run \`npm run gen:types\`) ` +
              `or these entries should be removed from MULTI_FK_TO_USERS.`
          : 'MULTI_FK_TO_USERS matches schema',
    ).toEqual({ missing: [], extra: [] });
  });
});
