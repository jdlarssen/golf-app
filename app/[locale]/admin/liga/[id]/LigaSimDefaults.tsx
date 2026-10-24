'use client';

import { useActionState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Card } from '@/components/ui/Card';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { SimSettingsFields } from '@/components/league/SimSettingsFields';
import { updateLeagueSimSettings, type LeagueActionError } from '@/lib/league/actions';
import type { SimSettingKey } from '@/lib/league/simSettings';

const INITIAL: LeagueActionError = { error: '' };

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
  const [state, action] = useActionState(
    async (_prev: LeagueActionError, formData: FormData) => updateLeagueSimSettings(formData),
    INITIAL,
  );
  const errorKey = `simSettingsErrors.${state.error}` as Parameters<typeof t>[0];

  return (
    <section className="mb-5" data-testid="liga-sim-defaults">
      <h2 className="font-sans text-[11px] font-semibold uppercase tracking-[0.18em] text-muted mb-3">
        {t('simSettingsHeading')}
      </h2>
      <Card>
        <form action={action} className="space-y-3">
          <input type="hidden" name="league_id" value={leagueId} />
          <SimSettingsFields
            initial={initial}
            idPrefix={`liga-defaults-${leagueId}`}
            locale={locale}
            gimmeLockedNote={tSim('gimmeLocked')}
          />
          <p className="font-sans text-[12px] leading-[18px] text-muted">{t('simSettingsHelp')}</p>
          {state.error !== '' && (
            <p role="alert" className="font-sans text-[12px] text-danger">
              {t.has(errorKey) ? t(errorKey) : t('simSettingsErrors.update_failed')}
            </p>
          )}
          <SubmitButton
            variant="secondary"
            className="text-sm px-4 py-2 min-h-[44px]"
            pendingLabel={t('simSettingsSaving')}
          >
            {t('simSettingsSave')}
          </SubmitButton>
        </form>
      </Card>
    </section>
  );
}
