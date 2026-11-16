import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * #2482: every place in app/, lib/ and native/app/src that deletes a
 * `game_players` row is listed below, with whether it gives the freed seat to
 * the waiting list (`promoteWaitlist`) and why not when it does not. A seat
 * that frees without a promotion is not lost — the request still waits in the
 * organiser's inbox (U9) — but the player who was first on the list never
 * hears. A new delete site turns this red: decide, then list it here.
 *
 * The count guards new sites; `promotes` guards that the file calls
 * `promoteWaitlist`. That the call happens after the delete and never undoes
 * it is the cores' own tests'.
 */
const DELETE_SITES: Record<string, { count: number; promotes: boolean; reason: string }> = {
  'lib/games/withdrawSelf.ts': {
    count: 3,
    promotes: true,
    reason: "a player's withdrawal before the start, and the captain's (the team's unconfirmed seats, then the captain's)",
  },
  'app/[locale]/games/[id]/spillere/actions.ts': {
    count: 1,
    promotes: true,
    reason: 'removePlayerFromGame: the organiser removes a player before the start',
  },
  'app/[locale]/admin/games/[id]/edit/actions.ts': {
    count: 2,
    promotes: true,
    reason:
      '«Rediger» removes players (writeRosterPlan); the save promotes after it, which also covers a higher cap and the list turned on. The second delete is the compensation of a failed save',
  },
  'app/[locale]/games/[id]/ta-med-gjest/actions.ts': {
    count: 1,
    promotes: true,
    reason: 'the host removes a seated guest',
  },
  'lib/games/selfRegistration.ts': {
    count: 1,
    promotes: true,
    reason:
      "the matchplay race loser's own row, just written (matchplay has no list); the file promotes after «Trekk forespørselen»",
  },
  'lib/games/registrationDecisionCore.ts': {
    count: 1,
    promotes: false,
    reason: "the compensation of a failed «Godta»: the seats were never the round's",
  },
  'lib/games/teamDashboardCore.ts': {
    count: 1,
    promotes: false,
    reason: 'a captain removes a teammate: a team holds its full size, so no seat frees (U10)',
  },
  'lib/games/teamRegistrationCore.ts': {
    count: 1,
    promotes: false,
    reason: 'a teammate declines: a team holds its full size, so no seat frees (U10)',
  },
  'lib/cup/swapCupMatchPlayerCore.ts': {
    count: 2,
    promotes: false,
    reason: "a cup match's roster is the cup's; no signup, no list",
  },
  'lib/league/startLeagueRoundFlightCore.ts': {
    count: 1,
    promotes: false,
    reason: "a league round's flight; no signup, no list",
  },
  'native/app/src/data/createGame.ts': {
    count: 2,
    promotes: false,
    reason: "the app wizard's draft roster; a draft takes no signups",
  },
  'native/app/src/data/rosterActions.ts': {
    count: 1,
    promotes: false,
    reason:
      'the organiser removes a player in the app, written through RLS with no server code to call (#2482 ships no app code); the request waits in the inbox (U9)',
  },
};

const ROOT = join(__dirname, '..', '..');
const DIRS = ['app', 'lib', 'native/app/src'];
const DELETE = /from\(\s*['"]game_players['"]\s*\)\s*\.delete\(/g;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      return entry.name === 'node_modules' || entry.name === '__mocks__' ? [] : sourceFiles(path);
    }
    return /\.(ts|tsx)$/.test(entry.name) && !/\.(test|spec)\.tsx?$/.test(entry.name)
      ? [path]
      : [];
  });
}

describe('game_players delete sites and the waiting list (#2482)', () => {
  const sources = Object.fromEntries(
    DIRS.flatMap((dir) => sourceFiles(join(ROOT, dir))).map((path) => [
      relative(ROOT, path),
      readFileSync(path, 'utf8'),
    ]),
  );

  it('every delete site is listed', () => {
    const found = Object.fromEntries(
      Object.entries(sources)
        .map(([file, text]) => [file, text.match(DELETE)?.length ?? 0] as const)
        .filter(([, n]) => n > 0),
    );
    const expected = Object.fromEntries(
      Object.entries(DELETE_SITES).map(([file, { count }]) => [file, count]),
    );
    expect(found).toEqual(expected);
  });

  it('every site that promotes calls promoteWaitlist', () => {
    const missing = Object.entries(DELETE_SITES)
      .filter(([, { promotes }]) => promotes)
      .map(([file]) => file)
      .filter((file) => !sources[file]?.includes('promoteWaitlist('));
    expect(missing).toEqual([]);
  });
});
