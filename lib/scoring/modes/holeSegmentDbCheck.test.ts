/**
 * Trap #4 agreement test (AGENTS.md): DB CHECK ↔ TS predicate must stay in sync.
 *
 * games.hole_segment ≠ 'full' is only valid for the matchplay duel formats,
 * enforced by games_hole_segment_matchplay_only in 0151. The same family
 * boundary lives in isMatchplayFamily (lib/scoring/modes/types.ts), which the
 * app uses for segment-aware routing and display.
 *
 * The mode universe is extracted from the games_game_mode_check constraint in
 * 0111 (same technique as lib/formats/gameModeDbCheck.test.ts), so a future
 * format that lands in 0111 without a decision on segment support fails here
 * and forces all layers to agree in the same commit.
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { isMatchplayFamily } from './types';
import type { GameMode } from './types';

const MIGRATIONS_DIR = path.resolve(__dirname, '../../../supabase/migrations');

function extractQuotedValues(sql: string): Set<string> {
  const values = new Set<string>();
  for (const m of sql.matchAll(/'([a-z_0-9]+)'/g)) {
    values.add(m[1]);
  }
  return values;
}

/** All valid game_mode slugs, from games_game_mode_check in 0111. */
function extractModeUniverse(): Set<string> {
  const content = fs.readFileSync(
    path.join(MIGRATIONS_DIR, '0111_games_game_mode_validity.sql'),
    'utf-8',
  );
  const block = content.match(
    /add constraint games_game_mode_check check \(\s*game_mode in \(([\s\S]*?)\)\s*\)/i,
  );
  if (!block) throw new Error('Could not find games_game_mode_check constraint in 0111');
  return extractQuotedValues(block[1]);
}

/** Modes allowed a non-'full' hole_segment, from the 0151 constraint. */
function extractSegmentAllowedModes(): Set<string> {
  const content = fs.readFileSync(
    path.join(MIGRATIONS_DIR, '0151_games_hole_segment_and_source_game.sql'),
    'utf-8',
  );
  const block = content.match(
    /add constraint games_hole_segment_matchplay_only check \(([\s\S]*?)\);/i,
  );
  if (!block) {
    throw new Error('Could not find games_hole_segment_matchplay_only constraint in 0151');
  }
  const inList = block[1].match(/game_mode in \(([\s\S]*?)\)/i);
  if (!inList) throw new Error('Could not find game_mode in (…) list in 0151 constraint');
  return extractQuotedValues(inList[1]);
}

describe('games_hole_segment_matchplay_only DB ↔ isMatchplayFamily agreement (trap #4)', () => {
  const universe = [...extractModeUniverse()] as GameMode[];
  const segmentAllowed = extractSegmentAllowedModes();

  it('sanity: mode universe from 0111 is complete enough to exercise the boundary', () => {
    expect(universe.length).toBeGreaterThanOrEqual(20);
    expect(universe).toContain('singles_matchplay');
    expect(universe).toContain('stableford');
  });

  it.each(universe)(
    'DB segment permission and isMatchplayFamily agree for mode: %s',
    (mode) => {
      expect(
        segmentAllowed.has(mode),
        `games_hole_segment_matchplay_only (0151) and isMatchplayFamily disagree for '${mode}'. ` +
          'Update both the CHECK constraint and the predicate in the same commit.',
      ).toBe(isMatchplayFamily(mode));
    },
  );

  it('every mode in the 0151 list is a valid game_mode per 0111 (no phantom slugs)', () => {
    const phantom = [...segmentAllowed].filter((m) => !universe.includes(m as GameMode));
    expect(phantom).toEqual([]);
  });
});
