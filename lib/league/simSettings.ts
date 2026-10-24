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
 * on the simulator. A change is one edit here plus one migration that FIRST
 * rewrites the stored values the new list refuses (`leagues.sim_settings`,
 * `league_rounds.sim_settings` and `league_rounds.sim_frozen_default`) to the
 * nearest valid code and THEN replaces `sim_settings_valid`: a replaced
 * function does not re-check the rows already stored (0215 shows the pattern).
 *
 * This file is the one home of the list (AGENTS.md trap 4). Its mirror is the
 * SQL function `sim_settings_valid` (0213, replaced in 0215), which the DB
 * CHECK on all three columns calls; `simSettings.test.ts` locks the two
 * together against the newest definition of the function.
 *
 * Two layers, both `jsonb` (0212):
 *  - `leagues.sim_settings`: the league's DEFAULT;
 *  - `league_rounds.sim_settings`: one round's OVERRIDE, only the keys that
 *    differ. The database locks it once a player has started the round.
 *  - `league_rounds.sim_frozen_default` (0214): the league default as it stood
 *    at the round's first start, written by the start core only.
 *
 * `roundSimSettings` is the one home of the rule for what a round shows and
 * marks: the web pages, the app view and the app read it, and nobody merges
 * default and override on their own.
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
 * is in `sim_settings_valid` (0213, 0215).
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

/**
 * The one home of the gimme coupling's effect on a set of values: under a
 * putting that locks it, gimme is «Not applicable», as Trackman shows it. The
 * form parser, the form's starting values, the form itself and the round
 * display all go through here; `roundOverrideFrom` keeps putting and gimme as
 * a pair so a stored override cannot split them.
 */
export function lockGimme<T extends SimSettings>(values: T): T {
  if (!gimmeLocked(values.putting) || values.gimme === undefined || values.gimme === GIMME_NONE) return values;
  return { ...values, gimme: GIMME_NONE };
}

/** The first distance: what a putting that needs one starts from. */
export const FIRST_GIMME_DISTANCE = 'FT4';

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
 * The rule the DB CHECK also applies (`sim_settings_valid`, 0215): every key
 * one of the eight (own keys only, so `toString` is not a setting) and every
 * code one of its options; putting and gimme both or neither, and then a
 * locking putting goes with «Not applicable» and any other putting with a
 * distance. A round override therefore always carries the pair
 * (`roundOverrideFrom`).
 */
export function validSimSettings(settings: SimSettings): boolean {
  for (const [key, code] of Object.entries(settings)) {
    if (!Object.hasOwn(SIM_SETTINGS, key) || !isOption(key as SimSettingKey, code)) return false;
  }
  if ((settings.putting === undefined) !== (settings.gimme === undefined)) return false;
  if (settings.putting === undefined) return true;
  return gimmeLocked(settings.putting) === (settings.gimme === GIMME_NONE);
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
  // The disabled gimme select posts nothing; the coupling fills it in.
  const coupled = gimmeLocked(out.putting) ? lockGimme({ ...out, gimme: out.gimme ?? GIMME_NONE }) : out;
  const complete = SIM_SETTING_KEYS.every((key) => coupled[key] !== undefined);
  if (!complete || !validSimSettings(coupled)) return { ok: false, error: 'sim_settings_invalid' };
  return { ok: true, settings: coupled as Record<SimSettingKey, string> };
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
 * Merge a round's override over a base: per key, the override's code where it
 * has one, else the base's. A key is marked overridden when the override's
 * code differs from the base's.
 */
export function effectiveSimSettings(base: unknown, override: unknown): EffectiveSimSettings {
  const from = normalizeSimSettings(base);
  const round = normalizeSimSettings(override);
  const values: SimSettings = {};
  const overriddenKeys: SimSettingKey[] = [];
  for (const key of SIM_SETTING_KEYS) {
    const value = round[key] ?? from[key];
    if (value !== undefined) values[key] = value;
    if (round[key] !== undefined && round[key] !== from[key]) overriddenKeys.push(key);
  }
  return { values, overriddenKeys };
}

/**
 * The one rule for what a round shows and what it marks «Endret denne
 * runden» (#2638): the organiser's override over a base. The base is the
 * league default frozen at the round's first start (`frozenDefault`, 0214),
 * or today's league default while the round has not started (or started
 * before anything was frozen). So a default the organiser changes later moves
 * only rounds nobody has started, a played round shows what applied, and the
 * mark means only what the organiser changed for that round.
 *
 * The web pages, the app view and the app read this (via the snapshot); nobody
 * merges default and override on their own.
 */
export function roundSimSettings(input: {
  leagueDefault: unknown;
  override: unknown;
  frozenDefault: unknown;
  started: boolean;
}): EffectiveSimSettings {
  const frozen =
    input.started && input.frozenDefault !== null && input.frozenDefault !== undefined;
  const base = frozen ? input.frozenDefault : input.leagueDefault;
  const merged = effectiveSimSettings(base, input.override);
  // Safety net: the form stores putting and gimme as a pair
  // (roundOverrideFrom), but a hand-written override could hold gimme alone.
  const values = lockGimme(merged.values);
  const baseGimme = normalizeSimSettings(base).gimme;
  const overriddenKeys = merged.overriddenKeys.filter(
    (key) => key !== 'gimme' || values.gimme !== (baseGimme ?? GIMME_NONE),
  );
  return { values, overriddenKeys };
}

/**
 * What the start core freezes into `league_rounds.sim_frozen_default` at a
 * round's first start: the league default as it stands, `{}` when there is
 * none, so the round counts as frozen either way. The database lets only the
 * server write it (0214).
 */
export function frozenDefaultFor(leagueSettings: unknown): SimSettings {
  return normalizeSimSettings(leagueSettings);
}

/**
 * The override to store from the admin's per-round form: only the values that
 * differ from the league default, with putting and gimme kept as a pair.
 * `null` = the round follows the default.
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
  // The gimme coupling binds putting and gimme together: when either
  // differs, both are stored, so a later change of the default can never pair
  // one round's gimme with another putting.
  if (override.putting !== undefined || override.gimme !== undefined) {
    if (values.putting !== undefined) override.putting = values.putting;
    if (values.gimme !== undefined) override.gimme = values.gimme;
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
  const values = lockGimme({ ...SIM_SETTING_DEFAULTS, ...normalizeSimSettings(json) });
  if (!gimmeLocked(values.putting) && values.gimme === GIMME_NONE) values.gimme = FIRST_GIMME_DISTANCE;
  return values;
}
