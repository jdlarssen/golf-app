import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  SIM_SETTING_KEYS,
  MAX_SIM_SETTING_VALUE,
  MAX_SIM_SETTING_OTHER,
  MAX_SIM_SETTINGS_JSON,
  maxLengthFor,
  parseSimSettings,
  normalizeSimSettings,
  effectiveSimSettings,
  frozenRoundSettings,
  roundOverrideFrom,
  simSettingEntries,
} from './simSettings';

function form(values: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(values)) fd.set(k, v);
  return fd;
}

/**
 * Length of `jsonb::text` for a flat object of strings: Postgres prints
 * `{"k": "v", "k2": "v2"}`, one space after each colon and comma, which
 * JSON.stringify leaves out.
 */
function pgJsonbTextLength(obj: Record<string, string>): number {
  const entries = Object.keys(obj).length;
  return JSON.stringify(obj).length + entries + Math.max(0, entries - 1);
}

describe('parseSimSettings', () => {
  it('reads the sim_<key> fields, trims them and leaves empty ones out', () => {
    const result = parseSimSettings(
      form({ sim_greenSpeed: '  Stimp 10 ', sim_wind: '', sim_other: 'Fairway: normal' }),
    );
    expect(result).toEqual({ ok: true, settings: { greenSpeed: 'Stimp 10', other: 'Fairway: normal' } });
  });

  it('gives an empty object when no field is filled in', () => {
    expect(parseSimSettings(form({}))).toEqual({ ok: true, settings: {} });
  });

  it('accepts a value at the limit and refuses one character more', () => {
    const atLimit = 'x'.repeat(MAX_SIM_SETTING_VALUE);
    expect(parseSimSettings(form({ sim_wind: atLimit }))).toEqual({
      ok: true,
      settings: { wind: atLimit },
    });
    expect(parseSimSettings(form({ sim_wind: `${atLimit}x` }))).toEqual({
      ok: false,
      error: 'sim_settings_too_long',
    });
  });

  it('gives «Annet» the longer limit', () => {
    const atLimit = 'x'.repeat(MAX_SIM_SETTING_OTHER);
    expect(parseSimSettings(form({ sim_other: atLimit }))).toEqual({
      ok: true,
      settings: { other: atLimit },
    });
    expect(parseSimSettings(form({ sim_other: `${atLimit}x` }))).toEqual({
      ok: false,
      error: 'sim_settings_too_long',
    });
  });

  it('strips control characters', () => {
    expect(parseSimSettings(form({ sim_putting: 'Gimme\u0000 innenfor\u0007 2 fot' }))).toEqual({
      ok: true,
      settings: { putting: 'Gimme innenfor 2 fot' },
    });
  });

  it('ignores fields that are not setting keys', () => {
    expect(parseSimSettings(form({ sim_hacked: 'x', greenSpeed: 'Stimp 1' }))).toEqual({
      ok: true,
      settings: {},
    });
  });
});

describe('normalizeSimSettings', () => {
  it.each([null, undefined, 'Stimp 10', 7, ['Stimp 10'], true])(
    'gives {} for a value that is not an object (%s)',
    (input) => {
      expect(normalizeSimSettings(input)).toEqual({});
    },
  );

  it('drops unknown keys, non-string values and empty strings', () => {
    expect(
      normalizeSimSettings({ greenSpeed: 'Stimp 10', wind: '', mulligans: 2, hacked: 'x', pins: '  ' }),
    ).toEqual({ greenSpeed: 'Stimp 10' });
  });

  it('clips an over-long value to its limit (a hand-written row cannot stretch the page)', () => {
    const out = normalizeSimSettings({ wind: 'x'.repeat(500), other: 'y'.repeat(500) });
    expect(out.wind).toHaveLength(MAX_SIM_SETTING_VALUE);
    expect(out.other).toHaveLength(MAX_SIM_SETTING_OTHER);
  });
});

describe('effectiveSimSettings', () => {
  const league = { greenSpeed: 'Stimp 10', wind: 'Rolig', tees: 'Gul' };

  it('no override: the league default, nothing marked', () => {
    expect(effectiveSimSettings(league, null)).toEqual({ values: league, overriddenKeys: [] });
  });

  it('partial override: the round value wins for its key, the rest comes from the default', () => {
    expect(effectiveSimSettings(league, { greenSpeed: 'Stimp 12' })).toEqual({
      values: { greenSpeed: 'Stimp 12', wind: 'Rolig', tees: 'Gul' },
      overriddenKeys: ['greenSpeed'],
    });
  });

  it('a round value equal to the default is not marked (the frozen copy)', () => {
    expect(effectiveSimSettings(league, { ...league })).toEqual({ values: league, overriddenKeys: [] });
  });

  it('full override: every differing key is marked, in the fixed key order', () => {
    const round = { tees: 'Rød', greenSpeed: 'Stimp 12', wind: 'Sterk' };
    expect(effectiveSimSettings(league, round)).toEqual({
      values: round,
      overriddenKeys: ['greenSpeed', 'wind', 'tees'],
    });
  });

  it('a round key the default does not have counts as overridden', () => {
    expect(effectiveSimSettings(league, { mulligans: 'En per ni' })).toEqual({
      values: { ...league, mulligans: 'En per ni' },
      overriddenKeys: ['mulligans'],
    });
  });

  it('an empty string in the round is not an override: the default stays', () => {
    expect(effectiveSimSettings(league, { wind: '' })).toEqual({ values: league, overriddenKeys: [] });
  });

  it('no default and no override: empty', () => {
    expect(effectiveSimSettings(null, null)).toEqual({ values: {}, overriddenKeys: [] });
  });
});

describe('frozenRoundSettings (what the start core writes at the first start)', () => {
  const league = { greenSpeed: 'Stimp 10', wind: 'Rolig' };

  it('a round with no override gets the full effective values', () => {
    expect(frozenRoundSettings(league, null)).toEqual(league);
  });

  it('a partial override is completed from the default', () => {
    expect(frozenRoundSettings(league, { greenSpeed: 'Stimp 12' })).toEqual({
      greenSpeed: 'Stimp 12',
      wind: 'Rolig',
    });
  });

  it('a round that already holds every effective value needs no write', () => {
    expect(frozenRoundSettings(league, { greenSpeed: 'Stimp 12', wind: 'Rolig' })).toBeNull();
  });

  it('a league with no settings still freezes the round, as an empty object', () => {
    expect(frozenRoundSettings(null, null)).toEqual({});
    expect(frozenRoundSettings(null, {})).toBeNull();
  });
});

describe('effectiveSimSettings on a frozen round', () => {
  it('shows only what was frozen: a key the default gained later does not leak in', () => {
    const laterDefault = { greenSpeed: 'Stimp 11', wind: 'Rolig', mulligans: 'Ingen' };
    const frozen = { greenSpeed: 'Stimp 10', wind: 'Rolig' };
    expect(effectiveSimSettings(laterDefault, frozen, true)).toEqual({
      values: frozen,
      overriddenKeys: ['greenSpeed'],
    });
  });
});

describe('roundOverrideFrom (the admin form keeps only what differs)', () => {
  const league = { greenSpeed: 'Stimp 10', wind: 'Rolig' };

  it('keeps the values that differ from the default', () => {
    expect(roundOverrideFrom({ greenSpeed: 'Stimp 12', wind: 'Rolig' }, league)).toEqual({
      greenSpeed: 'Stimp 12',
    });
  });

  it('gives null when nothing differs (the round follows the default)', () => {
    expect(roundOverrideFrom({ ...league }, league)).toBeNull();
    expect(roundOverrideFrom({}, league)).toBeNull();
  });
});

describe('simSettingEntries', () => {
  it('lists the set values in the fixed key order with their labels', () => {
    expect(simSettingEntries({ other: 'Fairway: normal', greenSpeed: 'Stimp 10' })).toEqual([
      { key: 'greenSpeed', label: 'Greenhastighet', value: 'Stimp 10' },
      { key: 'other', label: 'Annet', value: 'Fairway: normal' },
    ]);
  });
});

describe('one home for the rules (AGENTS.md trap 4)', () => {
  it('the DB CHECK bound in 0212 is MAX_SIM_SETTINGS_JSON', () => {
    const sql = fs.readFileSync(
      path.resolve(__dirname, '../../supabase/migrations/0212_league_simulator.sql'),
      'utf-8',
    );
    const bounds = [...sql.matchAll(/length\(sim_settings::text\)\s*<=\s*(\d+)/g)].map((m) => Number(m[1]));
    expect(bounds).toEqual([MAX_SIM_SETTINGS_JSON, MAX_SIM_SETTINGS_JSON]);
  });

  it('the largest object the validator accepts fits the CHECK, even all quotes', () => {
    const worst: Record<string, string> = {};
    for (const key of SIM_SETTING_KEYS) worst[key] = '"'.repeat(maxLengthFor(key));
    const parsed = parseSimSettings(form(Object.fromEntries(SIM_SETTING_KEYS.map((k) => [`sim_${k}`, worst[k]]))));
    expect(parsed.ok).toBe(true);
    expect(pgJsonbTextLength(worst)).toBeLessThanOrEqual(MAX_SIM_SETTINGS_JSON);
  });
});
