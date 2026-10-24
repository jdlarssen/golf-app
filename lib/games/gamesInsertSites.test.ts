import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * #2253 / #2625: a new solo strokeplay, team strokeplay, points (stableford,
 * patsome) or Nassau game ranks on net to par. The rule lives in the game's
 * `mode_config` (`ranking: 'net_to_par'`), stamped at creation by
 * `stampNewGameModeConfig`. Every place in app/, lib/
 * and native/app/src that puts a row in `games` is listed below: it either
 * stamps, or it is exempt by decision and says why. A new insert site turns
 * this red: stamp it, or list why it is exempt.
 *
 * Same shape as the game_players guard (#2209, `gamePlayersInsertSites.test.ts`).
 */
const INSERT_SITES: Record<string, { count: number; stamps: boolean; reason: string }> = {
  'app/[locale]/admin/games/new/actions.ts': {
    count: 1,
    stamps: true,
    reason: 'the web wizard, every format',
  },
  'lib/cup/insertCupMatches.ts': {
    count: 1,
    stamps: false,
    reason:
      'cup matches are matchplay or best ball (CupBundleFormat); the cup keeps the original rule by decision (contract #2625)',
  },
  'lib/league/startLeagueRoundFlightCore.ts': {
    count: 1,
    stamps: false,
    reason:
      'league rounds keep the original rule; the league is frozen (contract #2253). Moved from lib/league/actions.ts in #2638',
  },
  'native/app/src/data/createGame.ts': {
    count: 1,
    stamps: true,
    reason: 'the app wizard, which can create best ball and stableford (APP_SUPPORTED_MODES)',
  },
};

const ROOT = join(__dirname, '..', '..');
const DIRS = ['app', 'lib', 'native/app/src'];
const INSERT = /from\(\s*['"]games['"]\s*\)\s*\.(insert|upsert)\(/g;
const SQL_INSERT = /insert\s+into\s+(public\.)?"?games"?[\s(]/gi;

function sourceFiles(dir: string, ext: RegExp): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      return entry.name === 'node_modules' || entry.name === '__mocks__' ? [] : sourceFiles(path, ext);
    }
    return ext.test(entry.name) && !/\.(test|spec)\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

function read(files: string[]): Record<string, string> {
  return Object.fromEntries(files.map((path) => [relative(ROOT, path), readFileSync(path, 'utf8')]));
}

function insertSites(sources: Record<string, string>, pattern: RegExp): Record<string, number> {
  const result: Record<string, number> = {};
  for (const [file, text] of Object.entries(sources)) {
    const n = text.match(pattern)?.length ?? 0;
    if (n > 0) result[file] = n;
  }
  return result;
}

/** The body of `const <name> ... = [ ... ]` or `type <name> = ...;` in a file. */
function declaration(text: string, name: string): string {
  const start = text.search(new RegExp(`(const|type) ${name}\\b`));
  expect(start, `${name} not found`).toBeGreaterThanOrEqual(0);
  const end = text.indexOf(';', start);
  return text.slice(start, end);
}

describe('games insert sites stamp the net-to-par ranking (#2253, #2625)', () => {
  const sources = read(DIRS.flatMap((dir) => sourceFiles(join(ROOT, dir), /\.(ts|tsx)$/)));

  it('every insert site is listed', () => {
    const expected = Object.fromEntries(
      Object.entries(INSERT_SITES).map(([file, { count }]) => [file, count]),
    );

    expect(insertSites(sources, INSERT)).toEqual(expected);
  });

  it('every stamping site calls stampNewGameModeConfig', () => {
    const missing = Object.entries(INSERT_SITES)
      .filter(([, site]) => site.stamps)
      .map(([file]) => file)
      .filter((file) => !sources[file]?.includes('stampNewGameModeConfig('));

    expect(missing).toEqual([]);
  });

  it('the cup is exempt by decision: it can create best ball and does not stamp it', () => {
    // Cup best ball keeps the sum ranking (contract #2625). This is a choice,
    // not a premise: the cup can create a format that has the flag.
    const cupFormats =
      declaration(sources['lib/cup/cupTemplates.ts'], 'CupSessionFormat') +
      declaration(sources['lib/cup/cupPairing.ts'], 'CupBundleFormat');

    expect(cupFormats).toContain('best_ball');
    expect(cupFormats).not.toContain('solo_strokeplay');
    expect(cupFormats).not.toMatch(/stableford|patsome|nassau/);
    expect(sources['lib/cup/insertCupMatches.ts']).not.toContain('stampNewGameModeConfig(');
  });

  it('no database function inserts a game', () => {
    const migrations = read(sourceFiles(join(ROOT, 'supabase/migrations'), /\.sql$/));

    expect(insertSites(migrations, SQL_INSERT)).toEqual({});
  });

  it('counts inserts and upserts across line breaks, and SQL inserts', () => {
    expect(
      insertSites(
        {
          'chained.ts': "await admin\n  .from('games')\n  .insert({ name })\n  .select('id');",
          'upsert.ts': "await db.from('games').upsert(row);",
          'read.ts': "await db.from('games').select('id');",
          'other.ts': "await db.from('game_players').insert(rows);",
        },
        INSERT,
      ),
    ).toEqual({ 'chained.ts': 1, 'upsert.ts': 1 });
    expect(
      insertSites(
        { 'fn.sql': 'INSERT INTO public.games (name) VALUES ($1);', 'x.sql': 'insert into game_players (x)' },
        SQL_INSERT,
      ),
    ).toEqual({ 'fn.sql': 1 });
  });
});
