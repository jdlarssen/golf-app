'use client';

import { startTransition, useActionState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { SettingsDisclosure } from '@/components/league/SettingsDisclosure';
import {
  SIM_SETTINGS_SAVE_INITIAL,
  SimSettingsFields,
  countSave,
  simSettingsFieldsKey,
  type SimSettingsSaveState,
} from '@/components/league/SimSettingsFields';
import { updateLeagueSimSettings } from '@/lib/league/actions';
import type { SimSettingKey } from '@/lib/league/simSettings';

/**
 * #2638 (artboard 8a): the simulator league's default round settings. The
 * organiser can change them at any time; the change reaches only rounds
 * nobody has started, because a started round was frozen at its first start.
 */
export function LigaSimDefaults({
  leagueId,
  initial,
}: {
  leagueId: string;
  /** The stored default, completed with Trackman's defaults (formSimSettings). */
  initial: Record<SimSettingKey, string>;
}) {
  const t = useTranslations('liga.manage');
  const tSim = useTranslations('liga.simSettings');
  const locale = useLocale();
  const [state, action, isPending] = useActionState(
    async (prev: SimSettingsSaveState, formData: FormData) => countSave(prev, await updateLeagueSimSettings(formData)),
    SIM_SETTINGS_SAVE_INITIAL,
  );
  const errorKey = `simSettingsErrors.${state.error}` as Parameters<typeof t>[0];

  return (
    <section className="mb-5" data-testid="liga-sim-defaults">
      <h2 className="font-sans text-[11px] font-semibold uppercase tracking-[0.18em] text-muted mb-3">
        {t('simSettingsHeading')}
      </h2>
      <Card>
        {/* Folded to one line (the owner 25.10): the default is set once. */}
        <SettingsDisclosure summary={tSim('summary')} changedLabel={null} testId="liga-sim-defaults-disclosure">
          <form
            action={action}
            // React 19 resets a form after an `action` submit, and the controlled
            // selects then show the server-rendered values again; a second «Lagre»
            // would post those. preventDefault + a manual dispatch skips the reset
            // (same figure as CreateLigaForm, #1475); pending comes from
            // useActionState because useFormStatus does not see a manual dispatch.
            onSubmit={(e) => {
              e.preventDefault();
              const formData = new FormData(e.currentTarget);
              startTransition(() => action(formData));
            }}
            className="space-y-3"
          >
            <input type="hidden" name="league_id" value={leagueId} />
            {/* Keyed on the stored values and the save count: after a save the
                page renders the new default, and the fields start over from it.
                Disabled while saving, so a choice made meanwhile is not lost. */}
            <fieldset disabled={isPending} className="min-w-0">
              <SimSettingsFields
                key={simSettingsFieldsKey(initial, state.saves)}
                initial={initial}
                idPrefix={`liga-defaults-${leagueId}`}
                locale={locale}
                gimmeLockedNote={tSim('gimmeLocked')}
              />
            </fieldset>
            <p className="font-sans text-[12px] leading-[18px] text-muted">{t('simSettingsHelp')}</p>
            {state.error !== '' && (
              <p role="alert" className="font-sans text-[12px] text-danger">
                {t.has(errorKey) ? t(errorKey) : t('simSettingsErrors.update_failed')}
              </p>
            )}
            <Button
              type="submit"
              variant="secondary"
              className="text-sm px-4 py-2 min-h-[44px]"
              pending={isPending}
              pendingLabel={t('simSettingsSaving')}
              data-testid="liga-sim-defaults-save"
            >
              {t('simSettingsSave')}
            </Button>
          </form>
        </SettingsDisclosure>
      </Card>
    </section>
  );
}
