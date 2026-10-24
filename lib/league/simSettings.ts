/**
 * Round settings for a simulator league (#2638): what the organiser fixes so
 * everyone plays the round under the same conditions (stimp, wind, gimme …).
 *
 * Fixed label keys with free-text values. Nobody here has read Trackman's own
 * option lists, so the values are text, not enums (AGENTS.md I1).
 *
 * Two layers, both `jsonb` in the database (0212):
 *  - `leagues.sim_settings`: the league's DEFAULT.
 *  - `league_rounds.sim_settings`: one round's OVERRIDE, only the keys that
 *    differ. The start core freezes the effective values into it at the first
 *    start (`frozenRoundSettings`), and the database locks it from then on.
 *
 * `effectiveSimSettings` is the one home of the merge rule (trap 4): the web
 * league page, the web round start, the app view and the app all read it, and
 * nobody merges default and override on their own.
 *
 * Imports nothing on purpose: the native app imports this file by relative path.
 */

export const SIM_SETTING_KEYS = [
  'greenSpeed',
  'wind',
  'putting',
  'mulligans',
  'pins',
  'tees',
  'other',
] as const;

export type SimSettingKey = (typeof SIM_SETTING_KEYS)[number];

/** Key → free text. A missing key is a setting the organiser left out. */
export type SimSettings = Partial<Record<SimSettingKey, string>>;

/**
 * The Norwegian labels. The web reads them from `liga.simSettings.labels` in
 * the message catalogs; `simSettings.test.ts` locks the two together.
 */
export const SIM_SETTING_LABELS: Record<SimSettingKey, string> = {
  greenSpeed: 'Greenhastighet',
  wind: 'Vind',
  putting: 'Putting / gimme',
  mulligans: 'Mulligans',
  pins: 'Flaggplassering',
  tees: 'Tee',
  other: 'Annet',
};

/** Max characters per value. «Annet» gets more room. */
export const MAX_SIM_SETTING_VALUE = 60;
export const MAX_SIM_SETTING_OTHER = 300;

/**
 * The DB CHECK on both columns: `length(sim_settings::text) <= 2000` (0212).
 * The largest object the validator accepts fits well inside it (tested).
 */
export const MAX_SIM_SETTINGS_JSON = 2000;

export function maxLengthFor(key: SimSettingKey): number {
  return key === 'other' ? MAX_SIM_SETTING_OTHER : MAX_SIM_SETTING_VALUE;
}

/** The form field that carries a key's value. */
export function simSettingField(key: SimSettingKey): string {
  return `sim_${key}`;
}

// Control characters never belong in a one-line setting, and stripping them
// keeps the stored JSON's escaping (and so its length) predictable.
 
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/g;

function clean(value: string): string {
  return value.replace(CONTROL_CHARS, '').trim();
}

export type ParseSimSettingsResult =
  | { ok: true; settings: SimSettings }
  | { ok: false; error: 'sim_settings_too_long' };

/**
 * Reads the `sim_<key>` fields of a form. Empty fields are left out; a value
 * over its limit refuses the whole form (the inputs carry `maxLength`, so only
 * a hand-written post gets here).
 */
export function parseSimSettings(formData: FormData): ParseSimSettingsResult {
  const settings: SimSettings = {};
  for (const key of SIM_SETTING_KEYS) {
    const raw = formData.get(simSettingField(key));
    if (typeof raw !== 'string') continue;
    const value = clean(raw);
    if (!value) continue;
    if (value.length > maxLengthFor(key)) return { ok: false, error: 'sim_settings_too_long' };
    settings[key] = value;
  }
  return { ok: true, settings };
}

/**
 * Reads a stored `sim_settings` value defensively: anything that is not an
 * object gives `{}`, unknown keys, non-strings and empty strings are dropped,
 * and an over-long value is clipped (the CHECK allows more than the form).
 */
export function normalizeSimSettings(json: unknown): SimSettings {
  if (json === null || typeof json !== 'object' || Array.isArray(json)) return {};
  const source = json as Record<string, unknown>;
  const out: SimSettings = {};
  for (const key of SIM_SETTING_KEYS) {
    const raw = source[key];
    if (typeof raw !== 'string') continue;
    const value = clean(raw);
    if (value) out[key] = value.slice(0, maxLengthFor(key));
  }
  return out;
}

export type EffectiveSimSettings = {
  /** What applies to the round: the override's value per key, else the default's. */
  values: SimSettings;
  /** Keys whose round value differs from the league default, in key order. */
  overriddenKeys: SimSettingKey[];
};

/**
 * The one merge rule: per key, the round's value where it has one, else the
 * league's.
 *
 * `frozen`: the round has been started and its settings were frozen at that
 * start (`frozenRoundSettings`). Then the round's own values are the whole
 * truth, and a key the league default gained later does not leak in: a
 * closed round shows what actually applied.
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

export type SimSettingEntry = { key: SimSettingKey; label: string; value: string };

/** The set values in the fixed key order, with the Norwegian label. */
export function simSettingEntries(values: SimSettings): SimSettingEntry[] {
  return SIM_SETTING_KEYS.flatMap((key) => {
    const value = values[key];
    return value === undefined ? [] : [{ key, label: SIM_SETTING_LABELS[key], value }];
  });
}
