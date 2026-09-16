import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * #1894: every `from('scores')` in app/, lib/ and native/app/src either pages
 * through `selectAllRows` / `selectAllRowsResult` or is listed below with the
 * filter that keeps it far under PostgREST's 1 000-row cap. A new call site that
 * does neither turns this red: decide whether it can outgrow the cap, then page
 * it or list it here with its reason.
 */
const BOUNDED: Record<string, { count: number; reason: string }> = {
  'lib/games/getRoundScoresForGames.ts': {
    count: 1,
    reason: "one user_id's rows in the given games",
  },
  'lib/games/getActiveGameCardData.ts': {
    count: 1,
    reason: "the viewer's in-progress games, own and captain user_ids only",
  },
  'lib/notifications/deliveryReminder.ts': {
    count: 1,
    reason: 'one game, own and captain user_ids only',
  },
  'app/[locale]/admin/games/[id]/slett/page.tsx': {
    count: 1,
    reason: 'head: true count, no rows',
  },
  'app/[locale]/games/[id]/slett/page.tsx': {
    count: 1,
    reason: 'head: true count, no rows',
  },
  'app/[locale]/games/[id]/submit/page.tsx': {
    count: 1,
    reason: 'one game, own and captain user_ids only',
  },
  'app/[locale]/games/[id]/(home)/PrimaryCta.tsx': {
    count: 1,
    reason: 'one game, own and captain user_ids only',
  },
  'app/[locale]/games/[id]/leaderboard/page.tsx': {
    count: 1,
    reason: 'one game, eq user_id',
  },
  'app/[locale]/games/[id]/approve/page.tsx': {
    count: 1,
    reason: 'one game, the at most 3 players awaiting my approval',
  },
  'app/[locale]/games/[id]/holes/[holeNumber]/holePageData.ts': {
    count: 4,
    reason:
      'one hole of the roster (≤ 1 row per player); own/captain ids; eq user_id; sibling own/captain ids',
  },
  'app/[locale]/games/[id]/putter/page.tsx': {
    count: 1,
    reason: 'one game, eq user_id',
  },
  'app/[locale]/games/[id]/putter/actions.ts': {
    count: 1,
    reason: 'update of one user_id + hole_number, not a read',
  },
  'app/[locale]/games/[id]/scorecard/page.tsx': {
    count: 1,
    reason: "layout.scoreUserIds: the viewer's own flight or team columns",
  },
};

const ROOT = join(__dirname, '..', '..');
const DIRS = ['app', 'lib', 'native/app/src'];
const SCORES_FROM = /from\(\s*['"]scores['"]\s*\)/g;
/** How far above `.from('scores')` the paging call may open. */
const PAGED_LOOKBACK_LINES = 4;

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

/** Unpaged `from('scores')` occurrences per repo-relative file. */
function unpagedScoresReads(sources: Record<string, string>): Record<string, number> {
  const result: Record<string, number> = {};
  for (const [file, text] of Object.entries(sources)) {
    const lines = text.split('\n');
    lines.forEach((line, i) => {
      if (!SCORES_FROM.test(line)) return;
      SCORES_FROM.lastIndex = 0;
      const above = lines.slice(Math.max(0, i - PAGED_LOOKBACK_LINES), i).join('\n');
      if (/selectAllRows(Result)?\(/.test(above)) return;
      result[file] = (result[file] ?? 0) + 1;
    });
    SCORES_FROM.lastIndex = 0;
  }
  return result;
}

function repoSources(): Record<string, string> {
  return Object.fromEntries(
    DIRS.flatMap((dir) => sourceFiles(join(ROOT, dir))).map((path) => [
      relative(ROOT, path),
      readFileSync(path, 'utf8'),
    ]),
  );
}

describe('scores reads past the row cap (#1894)', () => {
  it('pages every unbounded scores read; the rest are listed with a reason', () => {
    const expected = Object.fromEntries(
      Object.entries(BOUNDED).map(([file, { count }]) => [file, count]),
    );

    expect(unpagedScoresReads(repoSources())).toEqual(expected);
  });

  it('counts a read as paged only when selectAllRows opens right above it', () => {
    expect(
      unpagedScoresReads({
        'paged.ts': "selectAllRowsResult(\n  (from, to) =>\n    db\n      .from('scores')",
        'bare.ts': "const { data } = await db\n  .from('scores')\n  .select('*');",
        'far.ts': "selectAllRows(\n\n\n\n\n  db.from('scores')",
      }),
    ).toEqual({ 'bare.ts': 1, 'far.ts': 1 });
  });
});
