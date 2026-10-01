import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { EDIT_FORM_COLUMNS } from './editGameInitialValues';

/**
 * Type A (#2258). Both edit pages render GameForm from a row they select, and
 * GameForm posts every field back from that state. A column the save writes
 * but the select lacks is reset on every save — `/games/[id]/rediger` turned
 * «Slipp venner direkte inn» off that way. This holds the shared select and
 * the update's column list together (trap 4: one rule, checked in one place).
 */
describe('EDIT_FORM_COLUMNS', () => {
  const actions = readFileSync(
    path.resolve(__dirname, '../../app/[locale]/admin/games/[id]/edit/actions.ts'),
    'utf8',
  );
  const update = /\.from\('games'\)\s*\.update\(\{([\s\S]*?)\n\s{4}\}\)/.exec(actions);
  const written = [...(update?.[1] ?? '').matchAll(/^\s{6}([a-z_]+)(?::|,)/gm)].map((m) => m[1]);
  const selected = new Set(EDIT_FORM_COLUMNS.split(',').map((c) => c.trim()));

  it('finds the update in the edit actions (the guard is not reading an empty list)', () => {
    expect(written).toEqual(expect.arrayContaining(['start_type', 'let_friends_skip_gate', 'prizes']));
    expect(written.length).toBeGreaterThan(15);
  });

  it('selects every column the edit save writes back from the form', () => {
    // status is set by the action itself, never from the form.
    const fromForm = written.filter((c) => c !== 'status');
    expect(fromForm.filter((c) => !selected.has(c))).toEqual([]);
  });
});
