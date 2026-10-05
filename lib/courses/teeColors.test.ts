/**
 * Trap #4 agreement test (AGENTS.md): DB CHECK ↔ TS palette must stay in sync.
 *
 * tee_boxes.color is limited by tee_boxes_color_check in
 * 0206_tee_box_color.sql (#2277). The same palette lives in TEE_COLORS
 * (./teeColors), which the course page and the picker (#2486) read. Same
 * technique as lib/scoring/modes/holeSegmentDbCheck.test.ts: read the key list
 * out of the migration, so widening one side without the other fails here.
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { TEE_COLORS, isTeeColor } from './teeColors';

const MIGRATION_FILE = path.resolve(
  __dirname,
  '../../supabase/migrations/0206_tee_box_color.sql',
);

function extractCheckKeys(): string[] {
  const content = fs.readFileSync(MIGRATION_FILE, 'utf-8');
  const block = content.match(
    /constraint tee_boxes_color_check\s+check \(color is null or color in \(([^)]*)\)\)/i,
  );
  if (!block) throw new Error('Could not find tee_boxes_color_check in 0206');
  return [...block[1].matchAll(/'([a-z]+)'/g)].map((m) => m[1]);
}

describe('tee_boxes.color DB CHECK ↔ TEE_COLORS agreement (trap #4)', () => {
  it('the CHECK allows exactly the keys in TEE_COLORS', () => {
    expect(extractCheckKeys().sort()).toEqual([...TEE_COLORS].sort());
  });
});

describe('isTeeColor', () => {
  const cases: [unknown, boolean][] = [
    ...TEE_COLORS.map((key): [unknown, boolean] => [key, true]),
    [null, false],
    [undefined, false],
    ['', false],
    ['Yellow', false],
    ['purple', false],
    [3, false],
  ];
  it.each(cases)('%j → %s', (value, expected) => {
    expect(isTeeColor(value)).toBe(expected);
  });
});
