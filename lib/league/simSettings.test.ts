import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  SIM_SETTING_KEYS,
  SIM_SETTINGS,
  SIM_SETTING_GROUPS,
  SIM_SETTING_DEFAULTS,
  GIMME_LOCKING_PUTTING,
  MAX_SIM_SETTINGS_JSON,
  gimmeLocked,
  optionLabel,
  parseSimSettings,
  normalizeSimSettings,
  validSimSettings,
  effectiveSimSettings,
  roundSimSettings,
  frozenDefaultFor,
  roundOverrideFrom,
  simSettingGroups,
  simSettingField,
  formSimSettings,
} from './simSettings';

/** A form with every setting filled in: the defaults, then `over`. */
function form(over: Record<string, string | null> = {}): FormData {
  const fd = new FormData();
  for (const key of SIM_SETTING_KEYS) {
    const value = key in over ? over[key] : SIM_SETTING_DEFAULTS[key];
    if (value !== null && value !== undefined) fd.set(simSettingField(key), value);
  }
  return fd;
}

describe('the list follows Trackman (contract addendum 24.10)', () => {
  it('eight settings in Trackman’s order: Game, then Course', () => {
    expect(SIM_SETTING_GROUPS.map((g) => [g.label, g.keys])).toEqual([
      ['Game', ['pins', 'putting', 'gimme', 'mulligans']],
      ['Course', ['wind', 'fairway_firmness', 'green_firmness', 'green_stimp']],
    ]);
    expect(SIM_SETTING_KEYS).toEqual(SIM_SETTING_GROUPS.flatMap((g) => g.keys));
  });

  it('the defaults are Golf Portal’s', () => {
    expect(SIM_SETTING_DEFAULTS).toEqual({
      pins: 'MEDIUM',
      putting: 'AUTO_TOUR_PRO',
      gimme: 'NOT_APPLICABLE',
      mulligans: 'NO',
      wind: 'CALM',
      fairway_firmness: 'MEDIUM',
      green_firmness: 'MEDIUM',
      green_stimp: '9',
    });
  });

  it('every default is one of its options, and the defaults pass the coupling rule', () => {
    for (const key of SIM_SETTING_KEYS) {
      expect(SIM_SETTINGS[key].options.map((o) => o.code)).toContain(SIM_SETTING_DEFAULTS[key]);
    }
    expect(validSimSettings(SIM_SETTING_DEFAULTS)).toBe(true);
  });

  it('shows Trackman’s own words', () => {
    expect([
      optionLabel('putting', 'AUTO_TOUR_PRO'),
      optionLabel('gimme', 'FT4'),
      optionLabel('wind', 'STRONG_BREEZE'),
      optionLabel('green_stimp', '10'),
      optionLabel('green_stimp', '13'),
    ]).toEqual(['Auto - Tour Pro', '1,2 m (4 ft)', 'Strong Breeze', '10 (3 m)', '13 (4,0 m)']);
  });
});

describe('the gimme coupling (one rule: here and in 0213)', () => {
  it.each(['AUTO_TOUR_PRO', 'AUTO_BY_HCP', 'AUTO_FIXED'])('%s locks gimme to Not applicable', (putting) => {
    expect(gimmeLocked(putting)).toBe(true);
    expect(validSimSettings({ ...SIM_SETTING_DEFAULTS, putting, gimme: 'NOT_APPLICABLE' })).toBe(true);
    expect(validSimSettings({ ...SIM_SETTING_DEFAULTS, putting, gimme: 'FT4' })).toBe(false);
  });

  it.each(['AUTO_TWO_PUTT', 'MANUAL', 'MANUAL_AIMED', 'MANUAL_INPUT'])('%s needs a distance', (putting) => {
    expect(gimmeLocked(putting)).toBe(false);
    expect(validSimSettings({ ...SIM_SETTING_DEFAULTS, putting, gimme: 'FT8' })).toBe(true);
    expect(validSimSettings({ ...SIM_SETTING_DEFAULTS, putting, gimme: 'NOT_APPLICABLE' })).toBe(false);
  });

  it('a round override with putting alone (gimme inherited) is valid on its own', () => {
    expect(validSimSettings({ putting: 'AUTO_FIXED' })).toBe(true);
  });
});

describe('parseSimSettings (the form)', () => {
  it('reads all eight settings', () => {
    expect(parseSimSettings(form())).toEqual({ ok: true, settings: SIM_SETTING_DEFAULTS });
  });

  it('a locking putting sets gimme to Not applicable (the disabled select posts nothing)', () => {
    expect(parseSimSettings(form({ putting: 'AUTO_BY_HCP', gimme: null }))).toEqual({
      ok: true,
      settings: { ...SIM_SETTING_DEFAULTS, putting: 'AUTO_BY_HCP', gimme: 'NOT_APPLICABLE' },
    });
  });

  it('Manual with a distance', () => {
    expect(parseSimSettings(form({ putting: 'MANUAL', gimme: 'FT12' }))).toEqual({
      ok: true,
      settings: { ...SIM_SETTING_DEFAULTS, putting: 'MANUAL', gimme: 'FT12' },
    });
  });

  it.each([
    ['an unknown option', { wind: 'HURRICANE' }],
    ['a missing setting', { pins: null }],
    ['Manual without a distance', { putting: 'MANUAL', gimme: 'NOT_APPLICABLE' }],
    ['Manual with no gimme posted', { putting: 'MANUAL', gimme: null }],
    ['free text', { green_stimp: 'Stimp 10' }],
  ])('refuses %s', (_name, over) => {
    expect(parseSimSettings(form(over))).toEqual({ ok: false, error: 'sim_settings_invalid' });
  });
});

describe('normalizeSimSettings (reading a stored value)', () => {
  it.each([null, undefined, 'CALM', 7, ['CALM'], true])('gives {} for a value that is not an object (%s)', (input) => {
    expect(normalizeSimSettings(input)).toEqual({});
  });

  it('drops unknown keys, unknown codes and non-strings', () => {
    expect(
      normalizeSimSettings({ wind: 'BREEZY', pins: 'IMPOSSIBLE', hacked: 'x', green_stimp: 10, tees: 'Gul' }),
    ).toEqual({ wind: 'BREEZY' });
  });
});

describe('effectiveSimSettings (merge an override over a base)', () => {
  const base = { ...SIM_SETTING_DEFAULTS, wind: 'BREEZY' };

  it('no override: the base, nothing marked', () => {
    expect(effectiveSimSettings(base, null)).toEqual({ values: base, overriddenKeys: [] });
  });

  it('partial override: the round wins for its key, the rest comes from the base', () => {
    expect(effectiveSimSettings(base, { green_stimp: '11' })).toEqual({
      values: { ...base, green_stimp: '11' },
      overriddenKeys: ['green_stimp'],
    });
  });

  it('full override: every differing key is marked, in Trackman’s order', () => {
    const round = { ...base, green_stimp: '12', pins: 'HARD', wind: 'GUSTY' };
    expect(effectiveSimSettings(base, round).overriddenKeys).toEqual(['pins', 'wind', 'green_stimp']);
  });

  it('no base and no override: empty', () => {
    expect(effectiveSimSettings(null, null)).toEqual({ values: {}, overriddenKeys: [] });
  });
});

describe('roundSimSettings: one rule for what a round shows and what it marks', () => {
  const d9 = { ...SIM_SETTING_DEFAULTS, green_stimp: '9' };
  const d10 = { ...SIM_SETTING_DEFAULTS, green_stimp: '10' };

  it.each([
    {
      name: 'not started, no override: today’s default, nothing marked',
      input: { leagueDefault: d10, override: null, frozenDefault: null, started: false },
      stimp: '10',
      marked: [],
    },
    {
      name: 'not started, the organiser overrides the stimp: marked',
      input: { leagueDefault: d10, override: { green_stimp: '11' }, frozenDefault: null, started: false },
      stimp: '11',
      marked: ['green_stimp'],
    },
    {
      name: 'staging 24.10: played with stimp 9, default changed to 10, no override → shows 9, no mark',
      input: { leagueDefault: d10, override: null, frozenDefault: d9, started: true },
      stimp: '9',
      marked: [],
    },
    {
      name: 'started with an override over the frozen default: the override shows and is marked',
      input: { leagueDefault: d10, override: { green_stimp: '11' }, frozenDefault: d9, started: true },
      stimp: '11',
      marked: ['green_stimp'],
    },
    {
      name: 'an override equal to the frozen default is not marked',
      input: { leagueDefault: d10, override: { green_stimp: '9' }, frozenDefault: d9, started: true },
      stimp: '9',
      marked: [],
    },
    {
      name: 'started with no settings at all (frozen {}): a default added later does not leak in',
      input: { leagueDefault: d10, override: null, frozenDefault: {}, started: true },
      stimp: undefined,
      marked: [],
    },
    {
      name: 'started before anything was frozen (no frozen default): today’s default',
      input: { leagueDefault: d10, override: null, frozenDefault: null, started: true },
      stimp: '10',
      marked: [],
    },
  ])('$name', ({ input, stimp, marked }) => {
    const result = roundSimSettings(input);
    expect({ stimp: result.values.green_stimp, marked: result.overriddenKeys }).toEqual({ stimp, marked });
  });
});

describe('frozenDefaultFor (what the start core freezes at the first start)', () => {
  it('the league default, normalised', () => {
    expect(frozenDefaultFor({ ...SIM_SETTING_DEFAULTS, hacked: 'x' })).toEqual(SIM_SETTING_DEFAULTS);
  });

  it('a league with no settings freezes an empty object, so the round counts as frozen', () => {
    expect(frozenDefaultFor(null)).toEqual({});
  });
});

describe('roundOverrideFrom (the admin form keeps only what differs)', () => {
  const league = { ...SIM_SETTING_DEFAULTS };

  it('keeps the values that differ from the default', () => {
    expect(roundOverrideFrom({ ...league, green_stimp: '11' }, league)).toEqual({ green_stimp: '11' });
  });

  it('gives null when nothing differs (the round follows the default)', () => {
    expect(roundOverrideFrom({ ...league }, league)).toBeNull();
  });
});

describe('simSettingGroups (the card)', () => {
  it('the two groups with names, Trackman’s words and the override mark; empty groups left out', () => {
    expect(
      simSettingGroups({ wind: 'BREEZY', green_stimp: '11', mulligans: 'NO' }, ['green_stimp'], 'no'),
    ).toEqual([
      { key: 'game', label: 'Game', rows: [{ key: 'mulligans', label: 'Mulligans', value: 'No', overridden: false }] },
      {
        key: 'course',
        label: 'Course',
        rows: [
          { key: 'wind', label: 'Vind', value: 'Breezy', overridden: false },
          { key: 'green_stimp', label: 'Greenhastighet', value: '11 (3,4 m)', overridden: true },
        ],
      },
    ]);
  });

  it('English names on the English site', () => {
    expect(simSettingGroups({ green_stimp: '9' }, [], 'en')[0].rows[0].label).toBe('Green stimp');
  });
});

describe('one home for the rules (AGENTS.md trap 4)', () => {
  const sql = () =>
    fs.readFileSync(path.resolve(__dirname, '../../supabase/migrations/0213_league_sim_settings_options.sql'), 'utf-8');

  it('the SQL option list in 0213 is the TS list, pair for pair', () => {
    const pairs = [...sql().matchAll(/\('([a-z_]+)',\s*'([A-Z0-9_]+)'\)/g)].map((m) => `${m[1]}=${m[2]}`);
    const ts = SIM_SETTING_KEYS.flatMap((key) => SIM_SETTINGS[key].options.map((o) => `${key}=${o.code}`));
    expect(pairs.sort()).toEqual([...ts].sort());
  });

  it('the putting values that lock gimme are the same in 0213', () => {
    const m = sql().match(/putting_locks_gimme[\s\S]*?array\[([^\]]+)\]/);
    expect(m, 'the locking list in 0213').toBeTruthy();
    const inSql = [...m![1].matchAll(/'([A-Z_]+)'/g)].map((x) => x[1]).sort();
    expect(inSql).toEqual([...GIMME_LOCKING_PUTTING].sort());
  });

  it('the largest object the validator accepts fits 0212’s length CHECK', () => {
    const longest = Object.fromEntries(
      SIM_SETTING_KEYS.map((key) => [
        key,
        SIM_SETTINGS[key].options.reduce((a, o) => (o.code.length > a.length ? o.code : a), ''),
      ]),
    );
    // jsonb::text prints `{"k": "v", ...}`: JSON.stringify plus a space per colon and comma.
    const n = SIM_SETTING_KEYS.length;
    expect(JSON.stringify(longest).length + n + (n - 1)).toBeLessThanOrEqual(MAX_SIM_SETTINGS_JSON);
  });
});

describe('formSimSettings (what a form starts from)', () => {
  it('missing keys come from Trackman’s defaults', () => {
    expect(formSimSettings({ wind: 'BREEZY' })).toEqual({ ...SIM_SETTING_DEFAULTS, wind: 'BREEZY' });
  });

  it('keeps the gimme coupling: Manual with no distance gets the first distance', () => {
    expect(formSimSettings({ putting: 'MANUAL' })).toMatchObject({ putting: 'MANUAL', gimme: 'FT4' });
  });

  it('a locking putting shows Not applicable whatever was stored', () => {
    expect(formSimSettings({ putting: 'AUTO_FIXED', gimme: 'FT8' })).toMatchObject({
      putting: 'AUTO_FIXED',
      gimme: 'NOT_APPLICABLE',
    });
  });

  it('nothing stored gives the defaults', () => {
    expect(formSimSettings(null)).toEqual(SIM_SETTING_DEFAULTS);
  });
});
