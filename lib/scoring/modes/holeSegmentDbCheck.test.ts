/**
 * Trap #4 agreement test (AGENTS.md): DB CHECK ↔ TS predicate must stay in sync.
 *
 * games.hole_segment ≠ 'full' is valid for the matchplay duel formats PLUS
 * best_ball (the back9-host for the derived singles matches, D11), enforced
 * by games_hole_segment_matchplay_only — dropped and re-added (same
 * constraint name) in 0152 to widen the list from the matchplay-only 0151
 * version. The same family boundary lives in supportsHoleSegment
 * (lib/scoring/modes/types.ts), the TS mirror the app uses for segment-aware
 * routing and display.
 *
 * The mode universe is extracted from the games_game_mode_check constraint in
 * 0111 (same technique as lib/formats/gameModeDbCheck.test.ts), so a future
 * format that lands in 0111 without a decision on segment support fails here
 * and forces all layers to agree in the same commit.
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { supportsHoleSegment } from './types';
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

/** Modes allowed a non-'full' hole_segment, from the 0152 constraint (revises 0151). */
function extractSegmentAllowedModes(): Set<string> {
  const content = fs.readFileSync(
    path.join(MIGRATIONS_DIR, '0152_hole_segment_allow_best_ball.sql'),
    'utf-8',
  );
  const block = content.match(
    /add constraint games_hole_segment_matchplay_only check \(([\s\S]*?)\);/i,
  );
  if (!block) {
    throw new Error('Could not find games_hole_segment_matchplay_only constraint in 0152');
  }
  const inList = block[1].match(/game_mode in \(([\s\S]*?)\)/i);
  if (!inList) throw new Error('Could not find game_mode in (…) list in 0152 constraint');
  return extractQuotedValues(inList[1]);
}

describe('games_hole_segment_matchplay_only DB ↔ supportsHoleSegment agreement (trap #4)', () => {
  const universe = [...extractModeUniverse()] as GameMode[];
  const segmentAllowed = extractSegmentAllowedModes();

  it('sanity: mode universe from 0111 is complete enough to exercise the boundary', () => {
    expect(universe.length).toBeGreaterThanOrEqual(20);
    expect(universe).toContain('singles_matchplay');
    expect(universe).toContain('stableford');
  });

  it.each(universe)(
    'DB segment permission and supportsHoleSegment agree for mode: %s',
    (mode) => {
      expect(
        segmentAllowed.has(mode),
        `games_hole_segment_matchplay_only (0152) and supportsHoleSegment disagree for '${mode}'. ` +
          'Update both the CHECK constraint and the predicate in the same commit.',
      ).toBe(supportsHoleSegment(mode));
    },
  );

  it('every mode in the 0152 list is a valid game_mode per 0111 (no phantom slugs)', () => {
    const phantom = [...segmentAllowed].filter((m) => !universe.includes(m as GameMode));
    expect(phantom).toEqual([]);
  });
});
