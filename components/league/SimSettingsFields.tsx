'use client';

import { useState } from 'react';
import {
  FIRST_GIMME_DISTANCE,
  SIM_SETTINGS,
  SIM_SETTING_GROUPS,
  SIM_SETTING_KEYS,
  gimmeLocked,
  lockGimme,
  simSettingField,
  type SimSettingKey,
} from '@/lib/league/simSettings';

const GIMME_NONE = 'NOT_APPLICABLE';

/**
 * A React `key` for <SimSettingsFields>: the codes in SIM_SETTING_KEYS order.
 * The fields hold their own state from `initial`, so a parent that renders
 * new stored values (after a save, «Tilbake til standard» or a changed
 * default) keys on them and the fields start over from what is stored.
 */
export function simSettingsFieldsKey(values: Record<SimSettingKey, string>): string {
  return SIM_SETTING_KEYS.map((key) => values[key]).join('|');
}

/**
 * The eight Trackman selects of a simulator league (#2638, artboards 8a–8c),
 * in Trackman's two groups «Game» and «Course». The names, options and
 * defaults come from the list in `lib/league/simSettings.ts`; nothing is
 * written here by hand.
 *
 * The gimme coupling mirrors Trackman: a putting that locks the gimme
 * (Auto - Tour Pro / By HCP / Fixed) disables the gimme select at «Not
 * applicable» (a disabled select posts nothing; parseSimSettings fills it in).
 * Every other putting needs a distance, so «Not applicable» leaves the list
 * and the first distance is picked.
 */
export function SimSettingsFields({
  initial,
  idPrefix,
  locale,
  gimmeLockedNote,
}: {
  initial: Record<SimSettingKey, string>;
  /** Unique per form on the page, so every label points at its own select. */
  idPrefix: string;
  locale: string;
  gimmeLockedNote: string;
}) {
  const [values, setValues] = useState(initial);

  function change(key: SimSettingKey, code: string) {
    setValues((prev) => {
      const next = lockGimme({ ...prev, [key]: code });
      if (key === 'putting' && !gimmeLocked(code) && next.gimme === GIMME_NONE) next.gimme = FIRST_GIMME_DISTANCE;
      return next;
    });
  }

  const gimmeIsLocked = gimmeLocked(values.putting);

  return (
    <div className="space-y-2" data-testid="sim-settings-fields">
      {SIM_SETTING_GROUPS.map((group, gi) => (
        <div key={group.key} className="space-y-2">
          <p
            className={`font-sans text-[10px] leading-[15px] font-semibold uppercase tracking-[0.14em] text-muted ${
              gi === 0 ? '' : 'pt-1'
            }`}
          >
            {group.label}
          </p>
          {group.keys.map((key) => {
            const id = `${idPrefix}-${key}`;
            const isGimme = key === 'gimme';
            const disabled = isGimme && gimmeIsLocked;
            const options = SIM_SETTINGS[key].options.filter(
              (o) => !isGimme || gimmeIsLocked || o.code !== GIMME_NONE,
            );
            return (
              <div key={key}>
                <label htmlFor={id} className="block font-sans text-[12px] leading-[18px] font-medium text-text mb-1">
                  {locale === 'en' ? SIM_SETTINGS[key].trackmanLabel : SIM_SETTINGS[key].label}
                </label>
                <div className="relative">
                  <select
                    id={id}
                    name={simSettingField(key)}
                    value={values[key]}
                    disabled={disabled}
                    onChange={(e) => change(key, e.target.value)}
                    data-testid={`sim-select-${key}`}
                    className="w-full min-h-[44px] cursor-pointer appearance-none rounded-xl border border-border bg-bg py-2 pl-3 pr-9 font-sans text-[14px] leading-[21px] text-text focus:ring-2 focus:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {options.map((o) => (
                      <option key={o.code} value={o.code}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  <svg
                    className={`pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted ${disabled ? 'opacity-60' : ''}`}
                    width="14"
                    height="14"
                    viewBox="0 0 14 14"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M3 5.5l4 4 4-4" />
                  </svg>
                </div>
                {disabled && (
                  <p className="mt-1 font-sans text-[11px] leading-4 text-muted">{gimmeLockedNote}</p>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
