import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import type { GameMode, GameModeConfig } from '@/lib/scoring/modes/types';
import { EDIT_FORM_COLUMNS, buildEditInitialValues, type EditGameRow } from './editGameInitialValues';

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

/**
 * Type A (#2444). The matchplay allowance lives in `mode_config.allowance_pct`.
 * Without pre-filling it, «Rediger spill» starts the field on the form default
 * and a save silently writes the default back over what the organiser chose.
 */
describe('buildEditInitialValues', () => {
  const row = (mode_config: GameModeConfig): EditGameRow => ({
    id: 'g1',
    name: 'Test',
    courses: null,
    status: 'scheduled',
    course_id: null,
    tee_box_id: null,
    scheduled_tee_off_at: null,
    hcp_allowance_pct: 100,
    require_peer_approval: false,
    score_visibility: 'live',
    side_tournament_enabled: false,
    side_ld_count: 0,
    side_ctp_count: 0,
    side_disabled_categories: [],
    game_mode: mode_config.kind as GameMode,
    mode_config,
    registration_mode: 'invite_only',
    registration_type: 'solo',
    let_friends_skip_gate: false,
  });
  const pair = { team_size: 2, teams_count: 2 } as const;

  it.each([
    ['fourball_allowance_pct', { kind: 'fourball_matchplay', ...pair, allowance_pct: 90 }, 90],
    ['fourball_allowance_pct', { kind: 'fourball_matchplay', ...pair, allowance_pct: 0 }, 0],
    ['foursomes_allowance_pct', { kind: 'foursomes_matchplay', ...pair, allowance_pct: 90 }, 90],
    ['greensome_allowance_pct', { kind: 'greensome_matchplay', ...pair, allowance_pct: 90 }, 90],
    ['chapman_allowance_pct', { kind: 'chapman_matchplay', ...pair, allowance_pct: 90 }, 90],
    ['gruesome_allowance_pct', { kind: 'gruesome_matchplay', ...pair, allowance_pct: 90 }, 90],
    ['round_robin_allowance_pct', { kind: 'round_robin', team_size: 1, teams_count: 4, allowance_pct: 90 }, 90],
  ] as const)('pre-fills %s from mode_config (%#)', (field, config, expected) => {
    const values = buildEditInitialValues(row(config as GameModeConfig), []);
    expect(values[field]).toBe(expected);
  });
});
