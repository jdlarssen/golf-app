import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * #2223: no write in app/, lib/ or components/ may throw its result away.
 *
 * postgrest-js and auth-js never throw on a DB or network failure; they hand back
 * `{ data, error }`. A bare `await client.from(…).update(…);` therefore loses the
 * error, and wrapping it in try/catch does not help: the catch only sees
 * synchronous throws. #727 fixed one such site in the league and #2064 one in the
 * cup, and both left the siblings behind. This guard turns the whole shape red.
 *
 * A thrown-away write is a statement that starts with `await` and whose awaited
 * expression is the client chain itself: `await x.from(…).insert|update|upsert|delete(…)`,
 * `await x.rpc(…)` or `await x.auth.admin.…(…)`. Wrappers never count, because the
 * statement then starts with the wrapper (`await expectAffected(…)`,
 * `await expectOneOrClaim(…)`, `await Promise.allSettled(…)`), and neither do
 * `const { error } = await …`, `return await …` or `? await …`.
 *
 * What it cannot see: a bare `await x.from(…).delete()` right under an `if (…)` line
 * without braces. That line ends on `)`, so the await is not a statement start.
 *
 * The fix: destructure `{ error }` and log it, and chain `.select()` plus
 * `expectAffected` where 0 rows means something went wrong.
 */

const ROOT = join(__dirname, '..', '..');
const DIRS = ['app', 'lib', 'components'];

const STATEMENT_START = /^\s*await\s+[\w.()]+/;
const CLIENT_CHAIN = /^await(\w+(\.\w+)*|getAdminClient\(\))\.(from\(|rpc\(|auth\.admin\.)/;
const TABLE_WRITE = /\.(insert|update|upsert|delete)\(/;
const COMMENT_LINE = /^\s*(\/\/|\/\*|\*)/;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      return entry.name === 'node_modules' || entry.name === 'testing' ? [] : sourceFiles(path);
    }
    return /\.(ts|tsx)$/.test(entry.name) && !/\.(test|spec)\.tsx?$/.test(entry.name)
      ? [path]
      : [];
  });
}

/** The last non-blank, non-comment line above `index`, or null at the top of the file. */
function previousCodeLine(lines: string[], index: number): string | null {
  for (let i = index - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (line === '' || COMMENT_LINE.test(line)) continue;
    return line;
  }
  return null;
}

/** `file:line` for every write whose result is thrown away. */
function thrownAwayWrites(sources: Record<string, string>): string[] {
  const violations: string[] = [];
  for (const [file, text] of Object.entries(sources)) {
    const lines = text.split('\n');
    lines.forEach((line, i) => {
      if (!STATEMENT_START.test(line)) return;
      const previous = previousCodeLine(lines, i);
      if (previous === null || !/[;{}]$/.test(previous)) return;

      const rest = lines.slice(i).join('\n');
      const end = rest.indexOf(';');
      const statement = (end === -1 ? rest : rest.slice(0, end)).replace(/\s+/g, '');
      const chain = CLIENT_CHAIN.exec(statement);
      if (!chain) return;
      if (chain[3] === 'from(' && !TABLE_WRITE.test(statement)) return;

      violations.push(`${file}:${i + 1}`);
    });
  }
  return violations;
}

function repoSources(): Record<string, string> {
  return Object.fromEntries(
    DIRS.flatMap((dir) => sourceFiles(join(ROOT, dir))).map((path) => [
      relative(ROOT, path),
      readFileSync(path, 'utf8'),
    ]),
  );
}

describe('write results that are thrown away (#2223)', () => {
  it('every write checks its result', () => {
    const violations = thrownAwayWrites(repoSources());

    expect(
      violations,
      'These writes throw their result away. Destructure { error } and log it, ' +
        'and chain .select() plus expectAffected where 0 rows means something went wrong (#2223).',
    ).toEqual([]);
  });

  it('flags the bare client chain and nothing that wraps or keeps the result', () => {
    expect(
      thrownAwayWrites({
        'update.ts': "try {\n  await supabase\n    .from('games')\n    .update({ a: 1 })\n    .eq('id', id);\n}",
        'rpc.ts': "const x = 1;\nawait admin.rpc('befriend_inviter', { p: 1 });",
        'auth.ts': '}\n// compensate\nawait admin.auth.admin.deleteUser(userId);',
        'getter.ts': "{\n  await getAdminClient().from('games').delete().eq('id', id);",
        'read.ts': "{\n  await supabase.from('games').select('id');",
        'wrapped.ts': "{\n  await expectAffected(\n    await sb.from('games').update({}).eq('id', id).select('id'),\n    'ctx',\n  );",
        'claim.ts': "{\n  await expectOneOrClaim(\n    await supabase.from('push').upsert(row).select('id'),\n  );",
        'settled.ts': "{\n  await Promise.allSettled(ids.map((id) => admin.from('x').delete().eq('id', id)));",
        'kept.ts': "{\n  const { error } = await supabase.from('games').update({}).eq('id', id);",
        'returned.ts': "{\n  return await supabase.from('games').update({}).eq('id', id);",
        'ternary.ts': "const r = ok\n  ? await supabase.from('games').update({}).eq('id', id)\n  : null;",
        'unbraced.ts': "if (failed)\n  await admin.from('games').delete().eq('id', id);",
      }),
    ).toEqual(['update.ts:2', 'rpc.ts:2', 'auth.ts:3', 'getter.ts:2']);
  });
});
