import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import type { GameMode, GameModeConfig } from '@/lib/scoring/modes/types';
import {
  EDIT_FORM_COLUMNS,
  EDIT_GAME_SELECT,
  buildEditFormInitialValues,
  buildEditInitialValues,
  type EditGameRow,
} from './editGameInitialValues';

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

  it('both edit pages select the links the wizard resume rule reads (#2269)', () => {
    // Without league_round_id a league-linked draft would open the wizard and
    // nothing would say so (`loadDraftResume` reads it as «no link»).
    const page = new Set(EDIT_GAME_SELECT.split(',').map((c) => c.trim()));
    expect(['group_id', 'tournament_id', 'league_round_id'].filter((c) => !page.has(c))).toEqual([]);
    expect([...selected].filter((c) => !page.has(c))).toEqual([]);
    // …and both pages read through it, not a list of their own.
    for (const route of ['../../app/[locale]/admin/games/[id]/edit/page.tsx', '../../app/[locale]/games/[id]/rediger/page.tsx']) {
      const source = readFileSync(path.resolve(__dirname, route), 'utf8');
      expect(source, route).toMatch(/\.select\(EDIT_GAME_SELECT\)/);
    }
  });

  it('writes and selects the hole per side-contest slot (#2283)', () => {
    // Both columns are in the update (so a save never drops them) and in the
    // select (so the form starts from what is stored).
    expect(written).toEqual(expect.arrayContaining(['side_ld_holes', 'side_ctp_holes']));
    expect(selected.has('side_ld_holes')).toBe(true);
    expect(selected.has('side_ctp_holes')).toBe(true);
  });

  it('selects every column the edit save writes back from the form', () => {
    // status is set by the action itself, never from the form.
    // group_id too (#2433): from the DB row or the wizard's checked field, never GameForm state.
    const fromForm = written.filter((c) => c !== 'status' && c !== 'group_id');
    expect(fromForm.filter((c) => !selected.has(c))).toEqual([]);
  });
});

/**
 * Type A (#2444). The matchplay allowance lives in `mode_config.allowance_pct`.
 * Without pre-filling it, «Rediger spill» starts the field on the form default
 * and a save silently writes the default back over what the organiser chose.
 */
const row = (
  mode_config: GameModeConfig,
  overrides: Partial<EditGameRow> = {},
): EditGameRow => ({
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
  ...overrides,
});

describe('buildEditInitialValues', () => {
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

/**
 * Type A (#2283). «Rediger spill» starts the setup form from the stored hole
 * per side-contest slot; without it a save would write the empty choice back
 * over the holes the organiser picked.
 */
describe('buildEditInitialValues — hull for sideturneringen', () => {
  const stableford: GameModeConfig = { kind: 'stableford', team_size: 1, points_table: 'standard' };

  it('carries the hole per slot, a null element included', () => {
    const values = buildEditInitialValues(
      row(stableford, {
        side_tournament_enabled: true,
        side_ld_count: 1,
        side_ctp_count: 2,
        side_ld_holes: [9],
        side_ctp_holes: [null, 7],
      }),
      [],
    );
    expect(values.side_ld_holes).toEqual([9]);
    expect(values.side_ctp_holes).toEqual([null, 7]);
  });

  it('a game without holes (null, or a row that does not select them) has none', () => {
    expect(buildEditInitialValues(row(stableford, { side_ld_holes: null }), []).side_ld_holes).toBeNull();
    expect(buildEditInitialValues(row(stableford), []).side_ctp_holes).toBeUndefined();
  });
});

/**
 * Type A (#2433). «Rediger spill» must know a club tournament, or «Lagre
 * endringer» demands a full roster for a game the members sign up to. Only a
 * club tournament (no cup) that is already invite_only gets `group_id`: with
 * an older club game on «Åpen»/«Godkjenning», the #643 lock would force
 * invite_only and a team game could no longer be saved.
 */
describe('buildEditFormInitialValues', () => {
  const stableford: GameModeConfig = { kind: 'stableford', team_size: 1, points_table: 'standard' };

  it.each<[string, Partial<EditGameRow>, string | undefined]>([
    ['klubb, invite_only, ingen cup', { group_id: 'club-1' }, 'club-1'],
    ['(vakt) ingen klubb', { group_id: null }, undefined],
    ['(vakt) klubb-cup-match', { group_id: 'club-1', tournament_id: 'cup-1' }, undefined],
    ['(vakt) eldre klubbspill med open', { group_id: 'club-1', registration_mode: 'open' }, undefined],
  ])('%s → group_id %s', (_label, overrides, expected) => {
    const values = buildEditFormInitialValues(row(stableford, overrides), []);
    expect(values.group_id).toBe(expected);
    expect(values.registration_mode).toBe(overrides.registration_mode ?? 'invite_only');
  });

  it('(vakt) buildEditInitialValues gir fortsatt aldri group_id (revansjen arver ikke klubben)', () => {
    const values = buildEditInitialValues(row(stableford, { group_id: 'club-1' }), []);
    expect(values.group_id).toBeUndefined();
  });
});

/**
 * Type A (#2463). A draft saved with «Nå» has no tee-off, so it opens with
 * «Nå» chosen again. A club, cup or league game never offers «Nå», and a
 * scheduled game always has a tee-off.
 */
describe('buildEditInitialValues — tee-off «Nå»', () => {
  const stableford: GameModeConfig = { kind: 'stableford', team_size: 1, points_table: 'standard' };

  it.each<[string, Partial<EditGameRow>, boolean | undefined]>([
    ['utkast uten tee-off', { status: 'draft' }, true],
    ['(vakt) utkast med tee-off', { status: 'draft', scheduled_tee_off_at: '2026-11-07T08:00:00.000Z' }, undefined],
    ['(vakt) planlagt spill', { status: 'scheduled' }, undefined],
    ['(vakt) klubbutkast', { status: 'draft', group_id: 'club-1' }, undefined],
    ['(vakt) cuputkast', { status: 'draft', tournament_id: 'cup-1' }, undefined],
    ['(vakt) ligautkast', { status: 'draft', league_round_id: 'round-1' }, undefined],
  ])('%s → tee_off_now %s', (_label, overrides, expected) => {
    const values = buildEditInitialValues(row(stableford, overrides), []);
    expect(values.tee_off_now).toBe(expected);
  });
});

/**
 * Type A (#2460). A draft and «Rediger spill» open with «Gjenta hver uke» as
 * stored. A cup match or league round is marked as linked, so the form never
 * offers the switch there (it cannot see those links itself).
 */
describe('buildEditInitialValues — «Gjenta hver uke»', () => {
  const stableford: GameModeConfig = { kind: 'stableford', team_size: 1, points_table: 'standard' };

  it.each<[string, Partial<EditGameRow>, boolean, boolean]>([
    ['på, frittstående', { repeat_weekly: true }, true, false],
    ['av, frittstående', { repeat_weekly: false }, false, false],
    ['uten kolonnen', {}, false, false],
    ['cupkamp', { tournament_id: 'cup-1' }, false, true],
    ['ligarunde', { league_round_id: 'round-1' }, false, true],
    ['klubbturnering (avgjøres av skjemaet)', { group_id: 'club-1' }, false, false],
  ])('%s → repeat_weekly %s, linked %s', (_label, overrides, repeat, linked) => {
    const values = buildEditInitialValues(row(stableford, overrides), []);
    expect(values.repeat_weekly).toBe(repeat);
    expect(values.repeat_weekly_linked).toBe(linked);
  });
});

/**
 * Type A (#2451). «Rediger spill» opens with the minutes between the flights
 * as stored, null for a round from before #2451. A row without the column (the
 * rematch) leaves it out, so the new round starts on the default. A cup match
 * or league round is linked: no start times there.
 */
describe('buildEditInitialValues — tid mellom flightene', () => {
  const stableford: GameModeConfig = { kind: 'stableford', team_size: 1, points_table: 'standard' };

  it.each<[string, Partial<EditGameRow>, number | null | undefined, boolean | undefined]>([
    ['12 min lagret', { tee_interval_minutes: 12 }, 12, undefined],
    ['gammel runde (null)', { tee_interval_minutes: null }, null, undefined],
    ['uten kolonnen (revansje)', {}, undefined, undefined],
    ['cupkamp', { tournament_id: 'cup-1', tee_interval_minutes: null }, null, true],
    ['ligarunde', { league_round_id: 'round-1' }, undefined, true],
  ])('%s → %s, linked %s', (_label, overrides, minutes, linked) => {
    const values = buildEditInitialValues(row(stableford, overrides), []);
    expect(values.tee_interval_minutes).toBe(minutes);
    expect(values.tee_interval_linked).toBe(linked);
  });
});

// #3002 (F23): «Rediger spill» shows the stored rule. A game without the key
// (created before #3002) reads as null: the field shows «Egen prosent» and
// posts no rule, so a save never adds the key to it.
describe('buildEditInitialValues — team_handicap_rule (#3002)', () => {
  const texas = { kind: 'texas_scramble', team_size: 4, teams_count: 2, team_handicap_pct: 10 } as const;
  it.each([
    [{ ...texas, team_handicap_rule: 'ngf_weighted' }, 'ngf'],
    [{ ...texas, team_handicap_rule: 'sum_pct' }, 'pct'],
    [texas, null],
    [{ kind: 'ambrose', team_size: 2, teams_count: 2, team_handicap_pct: 25, team_handicap_rule: 'sum_pct' }, 'pct'],
    [{ kind: 'florida_scramble', team_size: 3, teams_count: 2, team_handicap_pct: 15, team_handicap_rule: 'ngf_weighted' }, 'ngf'],
  ] as const)('%o → %s', (config, expected) => {
    expect(buildEditInitialValues(row(config as GameModeConfig), []).team_handicap_rule).toBe(expected);
  });

  it('a format without a team handicap has no rule', () => {
    const values = buildEditInitialValues(row({ kind: 'best_ball', team_size: 2, teams_count: 2 }), []);
    expect(values.team_handicap_rule).toBeUndefined();
  });
});
