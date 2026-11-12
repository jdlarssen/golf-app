/**
 * Type A guard (#2850, AGENTS.md trap 4: a rule has one home). «A league flight
 * has no place» lives in `finishedResultBadge.ts` and every reader asks it. The
 * rule used to carry a field size (#2712, «alone»), and the next reader to copy
 * that shape would show «2. plass av 2» again. These checks fail when a file
 * brings the size back or names a league flight «alone».
 */
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(__dirname, '../..');
const sources = execFileSync(
  'git',
  ['ls-files', '--', 'lib', 'app', 'components', 'native/app/src'],
  { cwd: root, encoding: 'utf8' },
)
  .split('\n')
  .filter((f) => /\.(ts|tsx)$/.test(f) && !/\.test\.(ts|tsx)$/.test(f));
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');

// Files that ask the rule. homeHero.ts also counts active players, for the
// label «Venter på markøren», which is about who approves a delivered card and
// not about the place (`leagueMarkerLabel`).
const SIZE_CHECK_ALLOWED = new Set(['native/app/src/lib/homeHero.ts']);

describe('the league flight rule has one home (#2850)', () => {
  it('no name calls a league flight «alone» or «solo»', () => {
    const offenders = sources.filter((file) =>
      /isLeagueFieldAlone|LeagueAlone|leagueAlone|leagueSolo|LEAGUE_SOLO|isLeagueRoundAlone|isLeagueCardAlone/.test(
        read(file),
      ),
    );
    expect(offenders).toEqual([]);
  });

  it('no call hands the rule a field size', () => {
    const offenders = sources.filter((file) => /leagueFlightHasNoPlace\([^)]*,/.test(read(file)));
    expect(offenders).toEqual([]);
  });

  it('no reader of the rule also checks for one player or a field of one', () => {
    const readers = sources.filter(
      (file) =>
        /leagueFlightHasNoPlace|leagueFlightPlayers|isUnplacedLeague(Round|Card)/.test(read(file)) &&
        !SIZE_CHECK_ALLOWED.has(file) &&
        file !== 'lib/games/finishedResultBadge.ts',
    );
    expect(readers.length).toBeGreaterThan(10);
    const offenders = readers.filter((file) =>
      /(players|rows|podium)\.length\s*(===|<=)\s*1\b|fieldSize\s*<=\s*1\b|=== 1\) *\{? *\/\/ *league/.test(read(file)),
    );
    expect(offenders).toEqual([]);
  });
});
