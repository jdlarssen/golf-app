/**
 * Trap #4 agreement test (AGENTS.md): who is wolf on a hole in the fixed part
 * of the rotation has two homes. `wolfTurn.ts` is the one the engine and the
 * hole pages read; `wolf_rotation_slot` (migration 0249) is the one the
 * database guard reads before it lets a wolf choice in.
 *
 * The pgTAP suite holds the SQL function to a table of expected slots. This
 * test holds that same table to `wolfTurn.ts`, so a change to the rule on
 * either side fails one of the two.
 */

import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { wolfFixedHolesForSlot, type WolfRotationRule } from '@/lib/scoring/modes/wolfTurn';

const PGTAP_FILE = path.resolve(
  __dirname,
  '../../supabase/tests/format_choice_write_rules_test.sql',
);

/** The 18 slots `wolfTurn.ts` gives, `null` where the standings decide. */
function slotsFromRule(rule: WolfRotationRule, players: number): Array<number | null> {
  const slots: Array<number | null> = Array.from({ length: 18 }, () => null);
  for (let slot = 1; slot <= players; slot += 1) {
    for (const hole of wolfFixedHolesForSlot(slot, players, rule)) slots[hole - 1] = slot;
  }
  return slots;
}

describe('wolf_rotation_slot (0249) ↔ wolfTurn.ts (trap #4)', () => {
  const content = fs.readFileSync(PGTAP_FILE, 'utf-8');
  const block = content.match(
    /-- wolf-rotation-table:start[^\n]*\n([\s\S]*?)-- wolf-rotation-table:end/,
  );

  const rows = [...(block?.[1] ?? '').matchAll(/\('(\w+)', (\d+), array\[([^\]]+)\]/g)].map(
    (m) => ({
      rule: m[1] as WolfRotationRule,
      players: Number(m[2]),
      slots: m[3].split(',').map((cell) => (cell.trim() === 'null' ? null : Number(cell))),
    }),
  );

  it('the pgTAP table covers 3 to 5 players under both rules', () => {
    expect(rows.map((r) => `${r.rule}/${r.players}`).sort()).toEqual(
      ['catch_up/3', 'catch_up/4', 'catch_up/5', 'trailing/3', 'trailing/4', 'trailing/5'],
    );
  });

  it.each(rows)('$rule with $players players: the same wolf on every hole', (row) => {
    expect(row.slots).toEqual(slotsFromRule(row.rule, row.players));
  });
});
