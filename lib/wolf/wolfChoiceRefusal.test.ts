import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { WOLF_CHOICE_DB_REFUSALS, wolfChoiceRefusal } from './wolfChoiceRefusal';

const MIGRATION = fs.readFileSync(
  path.resolve(__dirname, '../../supabase/migrations/0249_format_choice_write_rules.sql'),
  'utf-8',
);

describe('wolfChoiceRefusal', () => {
  it.each([
    ['wolf_choice_not_your_hole', 'not_wolf_on_hole'],
    ['wolf_choice_not_in_game', 'not_wolf_on_hole'],
    ['wolf_choice_game_not_active', 'game_not_active'],
    ['wolf_choice_partner_not_in_game', 'partner_not_in_game'],
    ['wolf_choice_hole_taken', 'hole_taken'],
  ])('42501 %s → %s', (message, expected) => {
    expect(wolfChoiceRefusal({ code: '42501', message })).toBe(expected);
  });

  it('a refusal without a known reason is rls_denied', () => {
    expect(
      wolfChoiceRefusal({ code: '42501', message: 'new row violates row-level security policy' }),
    ).toBe('rls_denied');
    expect(wolfChoiceRefusal({ code: '42501', message: 'wolf_choice_entered_by' })).toBe('rls_denied');
    expect(wolfChoiceRefusal({ code: '42501' })).toBe('rls_denied');
  });

  it.each([
    [{ code: '08006', message: 'connection failure' }],
    [{ code: '23503', message: 'violates foreign key constraint' }],
    [{ message: 'TypeError: Network request failed' }],
    [{ code: null, message: null }],
    // The reason only counts together with the refusal code.
    [{ code: '23514', message: 'wolf_choice_game_not_active' }],
  ])('%j is a failed save, not a refusal', (error) => {
    expect(wolfChoiceRefusal(error)).toBe('save_failed');
  });

  // Trap #4: the messages have two homes, the guard in 0249 and the table here.
  it.each(Object.keys(WOLF_CHOICE_DB_REFUSALS))('the guard in 0249 raises %s', (message) => {
    expect(MIGRATION).toContain(`raise exception '${message}' using errcode = '42501'`);
  });

  it('every reason the wolf guard raises is either mapped or deliberately generic', () => {
    const raised = [...MIGRATION.matchAll(/raise exception '(wolf_choice_[a-z_]+)'/g)].map(
      (m) => m[1],
    );
    const generic = ['wolf_choice_entered_by', 'wolf_choice_wrong_game'];
    expect([...new Set(raised)].sort()).toEqual(
      [...Object.keys(WOLF_CHOICE_DB_REFUSALS), ...generic].sort(),
    );
  });
});
