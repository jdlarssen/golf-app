'use client';

import { startTransition, useActionState, useId } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { Button } from '@/components/ui/Button';
import { SubmitButton } from '@/components/ui/SubmitButton';
import {
  updateLeagueRound,
  overrideRoundWindow,
  updateRoundSimSettings,
  type LeagueActionError,
} from '@/lib/league/actions';
import {
  SIM_SETTINGS_SAVE_INITIAL,
  SimSettingsFields,
  countSave,
  simSettingsFieldsKey,
  type SimSettingsSaveState,
} from '@/components/league/SimSettingsFields';
import {
  SIM_SETTINGS,
  formSimSettings,
  simSettingGroups,
} from '@/lib/league/simSettings';
import { formatShortOsloDayMonthLocale, formatTeeOffTimeLocale } from '@/lib/i18n/format';
import { formatOsloDateTimeLocal } from '@/lib/games/gamePayload';
import type { AppLocale } from '@/i18n/routing';
import type { LeagueRoundView } from '@/lib/league/getLigaSnapshot';
import type { CourseOption } from '@/app/[locale]/admin/games/new/GameForm';

type Props = {
  round: LeagueRoundView;
  leagueId: string;
  courseScope: string;
  courses: CourseOption[];
  /** #2638: a simulator league adjusts the round's settings here. */
  isSimulator: boolean;
};

const INITIAL: LeagueActionError = { error: '' };

/**
 * Formats a stored UTC timestamptz to 'YYYY-MM-DDTHH:mm' for a datetime-local
 * input — in Oslo wall-clock, the inverse of the storage conversion (#648), so
 * the admin edits the same time they originally picked.
 */
function toDatetimeLocal(iso: string): string {
  return formatOsloDateTimeLocal(iso);
}

/** Short display in Oslo wall-clock: "14. mai, 14:30" (no) / "14 May, 14:30" (en). */
function formatWindowDate(iso: string, locale: AppLocale): string {
  const dayMonth = formatShortOsloDayMonthLocale(iso, locale);
  const time = formatTeeOffTimeLocale(new Date(iso), locale);
  return `${dayMonth}, ${time}`;
}

export function LigaRoundRow({ round, leagueId, courseScope, courses, isSimulator }: Props) {
  const t = useTranslations('liga.roundRow');
  const tSim = useTranslations('liga.simSettings');
  // Labels point at their fields (htmlFor) so each field has a name.
  const fieldId = useId();
  const locale = useLocale() as AppLocale;

  const [overrideState, overrideAction] = useActionState(
    async (_prev: LeagueActionError, formData: FormData) =>
      overrideRoundWindow(formData) as Promise<LeagueActionError>,
    INITIAL,
  );
  const [settingsState, settingsAction, settingsPending] = useActionState(
    async (prev: SimSettingsSaveState, formData: FormData) => countSave(prev, await updateRoundSimSettings(formData)),
    SIM_SETTINGS_SAVE_INITIAL,
  );
  const settingsErrorKey = `settingsErrors.${settingsState.error}` as Parameters<typeof t>[0];
  const settingsLocale = locale === 'en' ? 'en' : 'no';
  const overriddenNames = round.overriddenKeys
    .map((key) => (settingsLocale === 'en' ? SIM_SETTINGS[key].trackmanLabel : SIM_SETTINGS[key].label))
    .join(', ');

  const settingsInitial = formSimSettings(round.simSettings);

  return (
    <div className="rounded-xl border border-border bg-surface p-4 space-y-3">
      {/* Round header */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-sans text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
            {t('roundLabel')} <span className="tabular-nums">{round.sequence}</span>
          </p>
          <p className="font-serif text-base text-text mt-0.5">{round.label}</p>
          <p className="font-sans text-[12px] text-muted mt-0.5">
            {formatWindowDate(round.opensAt, locale)} – {formatWindowDate(round.closesAt, locale)}
            {round.windowOverriddenAt && (
              <span className="ml-1.5 text-accent-text">{t('windowExtended')}</span>
            )}
          </p>
          {isSimulator && round.overriddenKeys.length > 0 && (
            <p className="font-sans text-[12px] text-accent-text mt-0.5" data-testid="liga-round-overridden">
              {t('overriddenLine', { settings: overriddenNames })}
            </p>
          )}
          <p className="font-sans text-[11px] tabular-nums text-muted mt-0.5">
            {t('flightCount', { count: round.flightCount })}
          </p>
        </div>
        {round.flaggedFlights > 0 && (
          <div className="shrink-0 rounded-lg bg-warning/10 border border-warning/30 px-2.5 py-1.5 text-center">
            <p className="font-sans text-[11px] font-semibold text-warning-text">
              {t('flaggedFlights', { count: round.flaggedFlights })}
            </p>
          </div>
        )}
      </div>

      {/* Tee / course update form. The two summaries draw 18px and sit 12px
          apart, so each hit area takes half the gap between them (#2240): this
          one reaches up over the header text instead, the next one down into
          the card padding while closed (open, a field label sits there). */}
      <details className="group">
        <summary className="tap-extend cursor-pointer font-sans text-[12px] font-medium text-primary list-none [--tap-extend:-20px_0_-6px]">
          {t('changeCourseLabel')}
        </summary>
        {/* #2638: a started simulator round keeps its course and tee (the
            settings card shows them); regular leagues can still correct a tee. */}
        {isSimulator && round.settingsLocked ? (
          <p className="mt-2 font-sans text-[12px] text-muted" data-testid="liga-round-course-locked">
            {t('settingsErrors.round_settings_locked')}
          </p>
        ) : (
          <CourseTeeForm round={round} leagueId={leagueId} courseScope={courseScope} courses={courses} />
        )}
      </details>

      {/* Override window form */}
      <details className="group">
        <summary
          className={`tap-extend cursor-pointer font-sans text-[12px] font-medium text-primary list-none ${
            isSimulator && !round.settingsLocked
              ? '[--tap-extend:-6px_0]'
              : '[--tap-extend:-6px_0_-20px] group-open:[--tap-extend:-6px_0]'
          }`}
        >
          {t('extendWindowLabel')}
        </summary>
        <form action={overrideAction} className="mt-3 space-y-2">
          <input type="hidden" name="round_id" value={round.id} />
          <input type="hidden" name="league_id" value={leagueId} />

          <div className="min-w-0">
            <label htmlFor={`${fieldId}-closes-at`} className="block font-sans text-[12px] font-medium text-text mb-1">
              {t('newDeadlineLabel')}
            </label>
            {/* iOS: native datetime-local strekker seg utenfor kortet uten
                appearance-none + min-w-0 (samme fiks som #453). */}
            <input
              type="datetime-local"
              id={`${fieldId}-closes-at`}
              name="closes_at"
              required
              defaultValue={toDatetimeLocal(round.closesAt)}
              className="w-full min-w-0 appearance-none rounded-xl border border-border bg-bg px-3 py-2 font-sans text-[14px] text-text focus:ring-2 focus:ring-primary/30 min-h-[44px]"
            />
          </div>

          {overrideState.error && overrideState.error !== '' && (
            <p role="alert" className="font-sans text-[12px] text-danger">{overrideState.error}</p>
          )}
          <SubmitButton variant="secondary" className="text-sm px-4 py-2 min-h-[44px]" pendingLabel={t('savePending')}>
            {t('saveDeadlineButton')}
          </SubmitButton>
        </form>
      </details>

      {/* #2638: the round's settings (artboards 8b/8c). A started round is
          fixed, so nobody plays under other settings than the others. */}
      {isSimulator && round.settingsLocked && (
        <LockedSimSettings round={round} locale={settingsLocale} lockedLabel={t('lockedStarted')} teeLabel={tSim('tee')} />
      )}
      {isSimulator && !round.settingsLocked && (
        <details className="group" data-testid="liga-round-adjust">
          <summary className="tap-extend cursor-pointer font-sans text-[12px] font-medium text-primary list-none [--tap-extend:-6px_0_-20px] group-open:[--tap-extend:-6px_0]">
            {t('adjustSettings')}
          </summary>
          <form
            action={settingsAction}
            // React 19 resets a form after an `action` submit and the controlled
            // selects fall back to the server-rendered values (see
            // LigaSimDefaults). The submitter goes into the FormData, so
            // «Tilbake til standard» still posts reset=true.
            onSubmit={(e) => {
              e.preventDefault();
              const formData = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter);
              startTransition(() => settingsAction(formData));
            }}
            className="mt-3 space-y-3"
          >
            <input type="hidden" name="round_id" value={round.id} />
            <input type="hidden" name="league_id" value={leagueId} />
            {/* Keyed on the values that apply and the save count: after a save,
                a reset or a changed default the fields start over from them.
                Disabled while saving, so a choice made meanwhile is not lost. */}
            <fieldset disabled={settingsPending} className="min-w-0">
              <SimSettingsFields
                key={simSettingsFieldsKey(settingsInitial, settingsState.saves)}
                initial={settingsInitial}
                idPrefix={`${fieldId}-sim`}
                locale={locale}
                gimmeLockedNote={tSim('gimmeLocked')}
              />
            </fieldset>
            {settingsState.error !== '' && (
              <p role="alert" className="font-sans text-[12px] text-danger">
                {t.has(settingsErrorKey) ? t(settingsErrorKey) : t('settingsErrors.update_failed')}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="submit"
                variant="secondary"
                className="text-sm px-4 py-2 min-h-[44px]"
                pending={settingsPending}
                pendingLabel={t('savePending')}
                data-testid="liga-round-settings-save"
              >
                {t('saveButton')}
              </Button>
              {/* Only a round with an override has a default to go back to (8b). */}
              {round.overriddenKeys.length > 0 && (
                <Button
                  type="submit"
                  variant="quiet"
                  name="reset"
                  value="true"
                  className="text-sm px-4 py-2 min-h-[44px]"
                  pending={settingsPending}
                  pendingLabel={t('savePending')}
                  data-testid="liga-round-reset"
                >
                  {t('resetToDefault')}
                </Button>
              )}
            </div>
          </form>
        </details>
      )}
    </div>
  );
}

/** «Bytt bane/tee»: the round's course (multi-course leagues) and tee. */
function CourseTeeForm({
  round,
  leagueId,
  courseScope,
  courses,
}: Pick<Props, 'round' | 'leagueId' | 'courseScope' | 'courses'>) {
  const t = useTranslations('liga.roundRow');
  const fieldId = useId();
  const [updateState, updateAction] = useActionState(
    async (_prev: LeagueActionError, formData: FormData) =>
      updateLeagueRound(formData) as Promise<LeagueActionError>,
    INITIAL,
  );
  const updateErrorKey = `settingsErrors.${updateState.error}` as Parameters<typeof t>[0];
  const selectedCourse = courses.find((c) => c.id === round.courseId);
  const tees = selectedCourse?.tee_boxes ?? [];

  return (
    <form action={updateAction} className="mt-3 space-y-2">
      <input type="hidden" name="round_id" value={round.id} />
      <input type="hidden" name="league_id" value={leagueId} />

      {courseScope === 'multi_course' && (
        <div>
          <label htmlFor={`${fieldId}-course-id`} className="block font-sans text-[12px] font-medium text-text mb-1">
            {t('courseLabel')}
          </label>
          <select
            id={`${fieldId}-course-id`}
            name="course_id"
            defaultValue={round.courseId ?? ''}
            className="w-full rounded-xl border border-border bg-bg px-3 py-2 font-sans text-[14px] text-text focus:ring-2 focus:ring-primary/30 min-h-[44px]"
          >
            <option value="">{t('courseNotSelected')}</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {(courseScope === 'multi_course' || courseScope === 'single_course') && (
        <div>
          <label htmlFor={`${fieldId}-tee-box-id`} className="block font-sans text-[12px] font-medium text-text mb-1">
            {t('teeLabel')}
          </label>
          <select
            id={`${fieldId}-tee-box-id`}
            name="tee_box_id"
            defaultValue={round.teeBoxId ?? ''}
            className="w-full rounded-xl border border-border bg-bg px-3 py-2 font-sans text-[14px] text-text focus:ring-2 focus:ring-primary/30 min-h-[44px]"
          >
            <option value="">{t('teeNotSelected')}</option>
            {tees.map((t_) => (
              <option key={t_.id} value={t_.id}>
                {t_.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {updateState.error !== '' && (
        <p role="alert" className="font-sans text-[12px] text-danger">
          {t.has(updateErrorKey) ? t(updateErrorKey) : t('settingsErrors.update_failed')}
        </p>
      )}
      <SubmitButton variant="secondary" className="text-sm px-4 py-2 min-h-[44px]" pendingLabel={t('savePending')}>
        {t('saveButton')}
      </SubmitButton>
    </form>
  );
}

/** «Låst: runden er startet» with the values that apply, read-only (artboard 8b). */
function LockedSimSettings({
  round,
  locale,
  lockedLabel,
  teeLabel,
}: {
  round: LeagueRoundView;
  locale: 'no' | 'en';
  lockedLabel: string;
  teeLabel: string;
}) {
  const groups = simSettingGroups(round.simSettings, round.overriddenKeys, locale);
  return (
    <div className="rounded-lg bg-surface-2 px-3 py-2.5" data-testid="liga-round-settings-locked">
      <p className="flex items-center gap-1.5 font-sans text-[11px] leading-[16.5px] font-medium text-muted">
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0">
          <rect x="3.5" y="7" width="9" height="6.5" rx="1.5" />
          <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" />
        </svg>
        <span>{lockedLabel}</span>
      </p>
      {groups.map((group, gi) => (
        <div key={group.key} className={gi === 0 ? 'mt-2' : 'mt-3'}>
          <p className="font-sans text-[10px] leading-[15px] font-semibold uppercase tracking-[0.14em] text-muted">
            {group.label}
          </p>
          <dl className="mt-1.5 space-y-1 font-sans text-[12px] leading-[18px]">
            {group.rows.map((row) => (
              <div key={row.key} className="flex justify-between gap-2">
                <dt className="text-muted">{row.label}</dt>
                <dd className={`min-w-0 text-right ${row.overridden ? 'text-accent-text' : 'text-text'}`}>{row.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      ))}
      {round.teeName && (
        <dl className="mt-2.5 border-t border-border pt-2.5 font-sans text-[12px] leading-[18px]">
          <div className="flex justify-between gap-2">
            <dt className="text-muted">{teeLabel}</dt>
            <dd className="min-w-0 text-right text-text">{round.teeName}</dd>
          </div>
        </dl>
      )}
    </div>
  );
}
