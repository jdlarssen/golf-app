// Shared helper for the DB-CHECK agreement tests (AGENTS.md trap 4, #2222).
// Not a test file: vitest collects only `*.test.*`.
import fs from 'fs';
import path from 'path';

const MIGRATIONS_DIR = path.resolve(__dirname, '../../supabase/migrations');

/**
 * The last migration, by file name (so by number), whose SQL matches `re`,
 * with the match. A later migration that redefines a CHECK wins over the one
 * that created it. Throws when nothing matches, so a renamed or dropped
 * constraint fails the test instead of passing it vacuously.
 */
export function lastMigrationMatch(re: RegExp): {
  file: string;
  match: RegExpMatchArray;
} {
  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith('.sql'))
    .sort();
  for (let i = files.length - 1; i >= 0; i--) {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, files[i]), 'utf-8');
    const match = sql.match(re);
    if (match) return { file: files[i], match };
  }
  throw new Error(`No migration in supabase/migrations matches ${re}`);
}
