import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * #2997 (F16/F25): the formats with their own percentage in `mode_config`
 * take it of the unrounded course handicap the start freezes in
 * `game_players.raw_course_handicap`, and fall back to the integer when the
 * row has none. A select that feeds an engine or the stroke views without the
 * column silently gives the old, twice-rounded strokes — on that one surface.
 *
 * Every select string in app/, lib/, components/ and native/app/src that reads
 * `game_players.course_handicap` is listed below. `feedsEngine: true` means
 * its rows reach `buildModeResultFromData`, a `build*Context`, an engine's
 * `compute`, `computeCupMatchResult` or the views' `matchStrokeHandicap` /
 * `alternateShotSideExtras` / `sideHandicap`, so it must read the new column
 * too. A new select turns this red: add the column, or list why it does not
 * need it.
 *
 * Same shape as `gamesInsertSites.test.ts`.
 */
const SELECT_SITES: Record<string, { selects: number; feedsEngine: boolean; reason: string }> = {
  'lib/scoring/buildModeResultForGame.ts': {
    selects: 1,
    feedsEngine: true,
    reason: 'the result builder: result summaries, round report, share image, ceremony, statistics',
  },
  'lib/games/getGameWithPlayers.ts': {
    selects: 1,
    feedsEngine: true,
    reason: 'PLAYERS_SELECT: the live leaderboard, the hole page, the scorecard',
  },
  'lib/games/gameBundleRows.ts': {
    selects: 1,
    feedsEngine: true,
    reason: 'PLAYER_SELECT: the app bundle (shared through Metro) and the cup match board',
  },
  'lib/cup/getCupSnapshot.ts': {
    selects: 1,
    feedsEngine: true,
    reason: 'the cup match results (computeCupMatchResult)',
  },
  'lib/mail/gameFinishedRecipients.ts': {
    selects: 1,
    feedsEngine: true,
    reason: 'the finished-game mail ranks the scramble family through buildUniformContext',
  },
  'app/[locale]/admin/games/[id]/page.tsx': {
    selects: 1,
    feedsEngine: false,
    reason: 'the admin roster shows the frozen number only',
  },
  'app/[locale]/profile/historikk/page.tsx': {
    selects: 1,
    feedsEngine: false,
    reason: 'round history: gross and net of the own card (computeRoundScore), no format engine',
  },
  'lib/games/getRoundScoresForGames.ts': {
    selects: 1,
    feedsEngine: false,
    reason: 'finished-round cards: gross and net of the own card, no format engine',
  },
  'lib/games/persistScoreDifferentials.ts': {
    selects: 1,
    feedsEngine: false,
    reason: 'the WHS score differential reads full_course_handicap (F1), not a format engine',
  },
  'lib/games/recomputeCourseHandicap.ts': {
    selects: 2,
    feedsEngine: false,
    reason:
      'the recompute writes the three columns itself; the greensome suggestion reads the integers, which the owner kept as before (24.11)',
  },
  'lib/kavalkade/loadKavalkadeInput.ts': {
    selects: 1,
    feedsEngine: false,
    reason: 'the review facts: gross and net of the own card (computeRoundScore)',
  },
  'lib/league/getLigaSnapshot.ts': {
    selects: 1,
    feedsEngine: false,
    reason: 'league formats take the general percentage (course_handicap is the playing handicap)',
  },
  'lib/league/leagueCardAccess.ts': {
    selects: 1,
    feedsEngine: false,
    reason: 'league formats take the general percentage (course_handicap is the playing handicap)',
  },
  'lib/league/markerReviewAccess.ts': {
    selects: 1,
    feedsEngine: false,
    reason: 'the marker review shows the frozen number only',
  },
  'native/app/src/data/roundHistory.ts': {
    selects: 1,
    feedsEngine: false,
    reason: 'the app round history: gross and net of the own card',
  },
};

const ROOT = join(__dirname, '..', '..');
const DIRS = ['app', 'lib', 'components', 'native/app/src'];
/** A quoted or backtick string on one line. */
const LITERAL = /(['`])([^'`\n]*)\1/g;
/** The integer column itself, not `full_` or `raw_course_handicap`. */
const COLUMN = /(^|[\s,(])course_handicap(?=[\s,)]|$)/;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      return entry.name === 'node_modules' || entry.name === '__mocks__' ? [] : sourceFiles(path);
    }
    return /\.tsx?$/.test(entry.name) && !/\.(test|spec)\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

/** Select lists (a comma inside) that read `course_handicap`, per file. */
function selectsByFile(): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const dir of DIRS) {
    for (const file of sourceFiles(join(ROOT, dir))) {
      const selects = [...readFileSync(file, 'utf8').matchAll(LITERAL)]
        .map((m) => m[2])
        .filter((s) => s.includes(',') && COLUMN.test(s));
      if (selects.length > 0) out.set(relative(ROOT, file), selects);
    }
  }
  return out;
}

describe('game_players-lesinger som mater motoren leser raw_course_handicap (#2997)', () => {
  const found = selectsByFile();

  it('every select of course_handicap is listed, with its count', () => {
    expect(Object.fromEntries([...found].map(([file, s]) => [file, s.length]))).toEqual(
      Object.fromEntries(Object.entries(SELECT_SITES).map(([file, site]) => [file, site.selects])),
    );
  });

  it.each(Object.entries(SELECT_SITES).filter(([, site]) => site.feedsEngine))(
    '%s reads raw_course_handicap next to course_handicap',
    (file) => {
      for (const select of found.get(file) ?? []) {
        expect(select).toMatch(/(^|[\s,])raw_course_handicap(?=[\s,]|$)/);
      }
    },
  );
});
