/**
 * Round settings for a simulator league (#2638): what the organiser fixes so
 * everyone plays the round under the same conditions on the Trackman.
 *
 * The list follows Trackman (contract addendum 24.10, sourced from Trackman's
 * help centre, TPS release notes and its tournament API): eight settings in
 * Trackman's order, the tab «Game» first, then «Course». Each has stable codes
 * (as Trackman's own API stores them), Trackman's own display words, and the
 * default Golf Portal fills in. The setting names are Norwegian; the option
 * texts stay in Trackman's words so players find them again on the simulator.
 * Some options are not confirmed yet (see the addendum); the owner checks them
 * on the simulator, and a change is one edit here plus one migration.
 *
 * This file is the one home of the list (AGENTS.md trap 4). Its mirror is the
 * SQL function `sim_settings_valid` (0213), which the DB CHECK on both
 * `sim_settings` columns calls; `simSettings.test.ts` locks the two together.
 *
 * Two layers, both `jsonb` (0212):
 *  - `leagues.sim_settings`: the league's DEFAULT;
 *  - `league_rounds.sim_settings`: one round's OVERRIDE, only the keys that
 *    differ. The start core freezes the effective values into it at the first
 *    start (`frozenRoundSettings`), and the database locks it from then on.
 *
 * `effectiveSimSettings` is the one home of the merge rule: the web pages, the
 * app view and the app read it, and nobody merges default and override on
 * their own.
 *
 * Imports nothing on purpose: the native app imports this file by relative path.
 */

export type SimSettingOption = { code: string; label: string };

type SimSettingDefinition = {
  /** The setting's name in Tørny. */
  label: string;
  /** Trackman's own name for it (the English site, and a hint for players). */
  trackmanLabel: string;
  options: readonly SimSettingOption[];
  default: string;
};

const LEVELS: readonly SimSettingOption[] = [
  { code: 'SOFT', label: 'Soft' },
  { code: 'MEDIUM', label: 'Medium' },
  { code: 'HARD', label: 'Hard' },
];

export const SIM_SETTINGS = {
  // ── Game ──
  pins: {
    label: 'Flaggplassering',
    trackmanLabel: 'Pins',
    options: [
      { code: 'EASY', label: 'Easy' },
      { code: 'MEDIUM', label: 'Medium' },
      { code: 'HARD', label: 'Hard' },
    ],
    default: 'MEDIUM',
  },
  putting: {
    label: 'Putting',
    trackmanLabel: 'Putting',
    options: [
      { code: 'AUTO_BY_HCP', label: 'Auto - By HCP' },
      { code: 'AUTO_TOUR_PRO', label: 'Auto - Tour Pro' },
      { code: 'AUTO_TWO_PUTT', label: 'Auto - Two Putt' },
      { code: 'AUTO_FIXED', label: 'Auto - Fixed' },
      { code: 'MANUAL', label: 'Manual' },
      { code: 'MANUAL_AIMED', label: 'Manual - Aimed' },
      { code: 'MANUAL_INPUT', label: 'Manual Input' },
    ],
    default: 'AUTO_TOUR_PRO',
  },
  gimme: {
    label: 'Gimme-avstand',
    trackmanLabel: 'Gimme distance',
    options: [
      { code: 'NOT_APPLICABLE', label: 'Not applicable' },
      { code: 'FT4', label: '1,2 m (4 ft)' },
      { code: 'FT8', label: '2,4 m (8 ft)' },
      { code: 'FT12', label: '3,7 m (12 ft)' },
      { code: 'FT16', label: '4,9 m (16 ft)' },
      { code: 'FT20', label: '6,1 m (20 ft)' },
    ],
    default: 'NOT_APPLICABLE',
  },
  mulligans: {
    label: 'Mulligans',
    trackmanLabel: 'Mulligans',
    options: [
      { code: 'NO', label: 'No' },
      { code: 'ALWAYS', label: 'Always' },
    ],
    default: 'NO',
  },
  // ── Course ──
  wind: {
    label: 'Vind',
    trackmanLabel: 'Wind',
    options: [
      { code: 'OFF', label: 'Off' },
      { code: 'CALM', label: 'Calm' },
      { code: 'BREEZY', label: 'Breezy' },
      { code: 'STRONG_BREEZE', label: 'Strong Breeze' },
      { code: 'VARIABLE', label: 'Variable' },
      { code: 'GUSTY', label: 'Gusty' },
      { code: 'WINDY', label: 'Windy' },
      { code: 'STORMY', label: 'Stormy' },
    ],
    default: 'CALM',
  },
  fairway_firmness: {
    label: 'Fairway-hardhet',
    trackmanLabel: 'Fairway firmness',
    options: LEVELS,
    default: 'MEDIUM',
  },
  green_firmness: {
    label: 'Green-hardhet',
    trackmanLabel: 'Green firmness',
    options: LEVELS,
    default: 'MEDIUM',
  },
  green_stimp: {
    label: 'Greenhastighet',
    trackmanLabel: 'Green stimp',
    options: [
      { code: '6', label: '6 (1,8 m)' },
      { code: '7', label: '7 (2,1 m)' },
      { code: '8', label: '8 (2,4 m)' },
      { code: '9', label: '9 (2,7 m)' },
      { code: '10', label: '10 (3 m)' },
      { code: '11', label: '11 (3,4 m)' },
      { code: '12', label: '12 (3,7 m)' },
      { code: '13', label: '13 (4,0 m)' },
      { code: '14', label: '14 (4,3 m)' },
    ],
    default: '9',
  },
} as const satisfies Record<string, SimSettingDefinition>;

export type SimSettingKey = keyof typeof SIM_SETTINGS;

/** Key → option code. A missing key is a setting the round takes from the default. */
export type SimSettings = Partial<Record<SimSettingKey, string>>;

/** The two Trackman tabs, in order, with their settings in order. */
export const SIM_SETTING_GROUPS = [
  { key: 'game', label: 'Game', keys: ['pins', 'putting', 'gimme', 'mulligans'] },
  { key: 'course', label: 'Course', keys: ['wind', 'fairway_firmness', 'green_firmness', 'green_stimp'] },
] as const satisfies ReadonlyArray<{ key: string; label: string; keys: readonly SimSettingKey[] }>;

export const SIM_SETTING_KEYS: readonly SimSettingKey[] = SIM_SETTING_GROUPS.flatMap((g) => g.keys);

/** Golf Portal's defaults: what a new league starts from. */
export const SIM_SETTING_DEFAULTS = Object.fromEntries(
  SIM_SETTING_KEYS.map((key) => [key, SIM_SETTINGS[key].default]),
) as Record<SimSettingKey, string>;

/**
 * Putting modes that make Trackman lock the gimme distance to «Not
 * applicable». With every other mode a distance must be chosen. The same list
 * is in `sim_settings_valid` (0213).
 */
export const GIMME_LOCKING_PUTTING: readonly string[] = ['AUTO_TOUR_PRO', 'AUTO_BY_HCP', 'AUTO_FIXED'];
const GIMME_NONE = 'NOT_APPLICABLE';

/**
 * The DB CHECK from 0212: `length(sim_settings::text) <= 2000`. The largest
 * object the list allows fits well inside it (tested).
 */
export const MAX_SIM_SETTINGS_JSON = 2000;

export function gimmeLocked(putting: string | undefined): boolean {
  return putting !== undefined && GIMME_LOCKING_PUTTING.includes(putting);
}

/** The form field that carries a key's code. */
export function simSettingField(key: SimSettingKey): string {
  return `sim_${key}`;
}

function isOption(key: SimSettingKey, code: unknown): code is string {
  return typeof code === 'string' && SIM_SETTINGS[key].options.some((o) => o.code === code);
}

/** Trackman's display words for a code; the code itself if it is unknown. */
export function optionLabel(key: SimSettingKey, code: string): string {
  return SIM_SETTINGS[key].options.find((o) => o.code === code)?.label ?? code;
}

/**
 * The rule the DB CHECK also applies (`sim_settings_valid`, 0213): every key
 * known and every code one of its options; when putting and gimme are both
 * present, a locking putting goes with «Not applicable» and any other putting
 * with a distance. A round override that holds putting alone is fine: its
 * gimme comes from the default.
 */
export function validSimSettings(settings: SimSettings): boolean {
  for (const [key, code] of Object.entries(settings)) {
    if (!(key in SIM_SETTINGS) || !isOption(key as SimSettingKey, code)) return false;
  }
  if (settings.putting !== undefined && settings.gimme !== undefined) {
    return gimmeLocked(settings.putting) === (settings.gimme === GIMME_NONE);
  }
  return true;
}

export type ParseSimSettingsResult =
  | { ok: true; settings: Record<SimSettingKey, string> }
  | { ok: false; error: 'sim_settings_invalid' };

/**
 * Reads the eight `sim_<key>` selects of a form. Every setting must be
 * chosen. A locking putting sets gimme to «Not applicable»: the form disables
 * that select, and a disabled select posts nothing.
 */
export function parseSimSettings(formData: FormData): ParseSimSettingsResult {
  const out: Partial<Record<SimSettingKey, string>> = {};
  for (const key of SIM_SETTING_KEYS) {
    const raw = formData.get(simSettingField(key));
    if (typeof raw === 'string' && raw !== '') out[key] = raw;
  }
  if (gimmeLocked(out.putting)) out.gimme = GIMME_NONE;
  const complete = SIM_SETTING_KEYS.every((key) => out[key] !== undefined);
  if (!complete || !validSimSettings(out)) return { ok: false, error: 'sim_settings_invalid' };
  return { ok: true, settings: out as Record<SimSettingKey, string> };
}

/**
 * Reads a stored `sim_settings` value defensively: anything that is not an
 * object gives `{}`; unknown keys, unknown codes and non-strings are dropped.
 */
export function normalizeSimSettings(json: unknown): SimSettings {
  if (json === null || typeof json !== 'object' || Array.isArray(json)) return {};
  const source = json as Record<string, unknown>;
  const out: SimSettings = {};
  for (const key of SIM_SETTING_KEYS) {
    const code = source[key];
    if (isOption(key, code)) out[key] = code;
  }
  return out;
}

export type EffectiveSimSettings = {
  /** What applies to the round: the override's code per key, else the default's. */
  values: SimSettings;
  /** Keys whose round value differs from the league default, in Trackman's order. */
  overriddenKeys: SimSettingKey[];
};

/**
 * The one merge rule: per key, the round's code where it has one, else the
 * league's.
 *
 * `frozen`: the round has been started and its settings were frozen at that
 * start. Then the round's own values are the whole truth, and a key the
 * league default gained later does not leak in: a closed round shows what
 * actually applied.
 */
export function effectiveSimSettings(
  leagueSettings: unknown,
  roundSettings: unknown,
  frozen = false,
): EffectiveSimSettings {
  const league = normalizeSimSettings(leagueSettings);
  const round = normalizeSimSettings(roundSettings);
  const values: SimSettings = {};
  const overriddenKeys: SimSettingKey[] = [];
  for (const key of SIM_SETTING_KEYS) {
    const value = frozen ? round[key] : (round[key] ?? league[key]);
    if (value !== undefined) values[key] = value;
    if (round[key] !== undefined && round[key] !== league[key]) overriddenKeys.push(key);
  }
  return { values, overriddenKeys };
}

/**
 * What the start core writes into a round at its first start (no game exists
 * for it yet): the full effective values, `{}` when there are none, so the
 * round is frozen either way. `null` when the round already holds exactly
 * those values and the write can be skipped. After the freeze the database
 * locks the round (0212), so a later change of the league default never moves
 * a round that is in play or done.
 */
export function frozenRoundSettings(
  leagueSettings: unknown,
  roundSettings: unknown,
): SimSettings | null {
  const { values } = effectiveSimSettings(leagueSettings, roundSettings);
  if (roundSettings === null || typeof roundSettings !== 'object' || Array.isArray(roundSettings)) {
    return values;
  }
  const round = normalizeSimSettings(roundSettings);
  const same =
    Object.keys(round).length === Object.keys(values).length &&
    SIM_SETTING_KEYS.every((key) => round[key] === values[key]);
  return same ? null : values;
}

/**
 * The override to store from the admin's per-round form: only the values that
 * differ from the league default. `null` = the round follows the default.
 */
export function roundOverrideFrom(
  formValues: SimSettings,
  leagueSettings: unknown,
): SimSettings | null {
  const league = normalizeSimSettings(leagueSettings);
  const values = normalizeSimSettings(formValues);
  const override: SimSettings = {};
  for (const key of SIM_SETTING_KEYS) {
    if (values[key] !== undefined && values[key] !== league[key]) override[key] = values[key];
  }
  return Object.keys(override).length > 0 ? override : null;
}

export type SimSettingRow = { key: SimSettingKey; label: string; value: string; overridden: boolean };
export type SimSettingGroup = { key: string; label: string; rows: SimSettingRow[] };

/**
 * The card's content: the two Trackman groups with the set values in order,
 * Trackman's words for each value and the «Endret denne runden» mark. A group
 * with no value is left out. `locale` picks the setting names: Norwegian, or
 * Trackman's own on the English site.
 */
export function simSettingGroups(
  values: SimSettings,
  overriddenKeys: readonly SimSettingKey[],
  locale: 'no' | 'en',
): SimSettingGroup[] {
  return SIM_SETTING_GROUPS.flatMap((group) => {
    const rows = group.keys.flatMap((key) => {
      const code = values[key];
      if (code === undefined) return [];
      return [
        {
          key,
          label: locale === 'en' ? SIM_SETTINGS[key].trackmanLabel : SIM_SETTINGS[key].label,
          value: optionLabel(key, code),
          overridden: overriddenKeys.includes(key),
        },
      ];
    });
    return rows.length > 0 ? [{ key: group.key, label: group.label, rows }] : [];
  });
}

/**
 * What a settings form starts from: the stored values, with Trackman's
 * defaults for anything missing, and the gimme coupling made to hold (a
 * locking putting shows «Not applicable»; any other putting a distance).
 */
export function formSimSettings(json: unknown): Record<SimSettingKey, string> {
  const values: Record<SimSettingKey, string> = { ...SIM_SETTING_DEFAULTS, ...normalizeSimSettings(json) };
  if (gimmeLocked(values.putting)) values.gimme = GIMME_NONE;
  else if (values.gimme === GIMME_NONE) values.gimme = SIM_SETTINGS.gimme.options[1].code;
  return values;
}
