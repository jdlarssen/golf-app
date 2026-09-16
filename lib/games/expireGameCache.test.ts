import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

vi.mock('next/cache', () => ({ revalidateTag: vi.fn() }));

import { revalidateTag } from 'next/cache';
import { expireGameCache, expireTournamentCache } from './expireGameCache';

/**
 * #2068: a mutation expires the game/cup cache at once, and the rule has one
 * home. Part 1 pins the helpers; part 2 sweeps `app/` and `lib/` so nobody goes
 * back to revalidating these tags with the 'max' profile directly
 * (stale-while-revalidate: the first visit after the write shows the old status).
 */

describe('expireGameCache / expireTournamentCache', () => {
  beforeEach(() => vi.mocked(revalidateTag).mockClear());

  it('expires the game tag immediately', () => {
    expireGameCache('g1');
    expect(revalidateTag).toHaveBeenCalledExactlyOnceWith('game-g1', { expire: 0 });
  });

  it('expires the tournament tag immediately', () => {
    expireTournamentCache('t1');
    expect(revalidateTag).toHaveBeenCalledExactlyOnceWith('tournament-t1', {
      expire: 0,
    });
  });
});

const ROOT = join(__dirname, '..', '..');
const HELPER = join('lib', 'games', 'expireGameCache.ts');

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...sourceFiles(path));
    } else if (
      /\.(ts|tsx)$/.test(entry.name) &&
      !/\.test\.(ts|tsx)$/.test(entry.name)
    ) {
      out.push(path);
    }
  }
  return out;
}

// A direct revalidation of a game or cup tag: `revalidateTag(`game-${id}`, …)`.
const DIRECT_CALL = /revalidateTag\(\s*`(game|tournament)-/g;

describe('game/cup cache tags go through the helper (#2068)', () => {
  it('finds no direct revalidateTag on a game- or tournament- tag', () => {
    const offenders: string[] = [];
    for (const top of ['app', 'lib']) {
      for (const file of sourceFiles(join(ROOT, top))) {
        const rel = relative(ROOT, file);
        if (rel === HELPER) continue;
        const src = readFileSync(file, 'utf8');
        for (const match of src.matchAll(DIRECT_CALL)) {
          const line = src.slice(0, match.index).split('\n').length;
          offenders.push(`${rel}:${line}`);
        }
      }
    }
    expect(
      offenders,
      'Use expireGameCache/expireTournamentCache from lib/games/expireGameCache.ts',
    ).toEqual([]);
  });
});
