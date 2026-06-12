'use client';

import { useActionState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { updateLeagueRound, overrideRoundWindow, type LeagueActionError } from '@/lib/league/actions';
import { formatShortUTCDayMonthLocale } from '@/lib/i18n/format';
import type { AppLocale } from '@/i18n/routing';
import type { LeagueRoundView } from '@/lib/league/getLigaSnapshot';
import type { CourseOption } from '@/app/[locale]/admin/games/new/GameForm';

type Props = {
  round: LeagueRoundView;
  leagueId: string;
  courseScope: string;
  courses: CourseOption[];
};

const INITIAL: LeagueActionError = { error: '' };

/** Formats a timestamptz ISO string to 'YYYY-MM-DDTHH:mm' for datetime-local input. */
function toDatetimeLocal(iso: string): string {
  // Slice off the timezone offset — datetime-local inputs use local wall time.
  // The server stores UTC; we display it without conversion (admin context).
  return iso.slice(0, 16);
}

/** Short display: "14. mai, 14:30" (no) / "14 May, 14:30" (en) */
function formatWindowDate(iso: string, locale: AppLocale): string {
  const d = new Date(iso);
  const dayMonth = formatShortUTCDayMonthLocale(iso, locale);
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${dayMonth}, ${hh}:${mm}`;
}

export function LigaRoundRow({ round, leagueId, courseScope, courses }: Props) {
  const t = useTranslations('liga.roundRow');
  const locale = useLocale() as AppLocale;

  const [updateState, updateAction] = useActionState(
    async (_prev: LeagueActionError, formData: FormData) =>
      updateLeagueRound(formData) as Promise<LeagueActionError>,
    INITIAL,
  );
  const [overrideState, overrideAction] = useActionState(
    async (_prev: LeagueActionError, formData: FormData) =>
      overrideRoundWindow(formData) as Promise<LeagueActionError>,
    INITIAL,
  );

  const selectedCourse = courses.find((c) => c.id === round.courseId);
  const tees = selectedCourse?.tee_boxes ?? [];

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
              <span className="ml-1.5 text-accent">{t('windowExtended')}</span>
            )}
          </p>
          <p className="font-sans text-[11px] tabular-nums text-muted mt-0.5">
            {t('flightCount', { count: round.flightCount })}
          </p>
        </div>
        {round.flaggedFlights > 0 && (
          <div className="shrink-0 rounded-lg bg-warning/10 border border-warning/30 px-2.5 py-1.5 text-center">
            <p className="font-sans text-[11px] font-semibold text-warning">
              {t('flaggedFlights', { count: round.flaggedFlights })}
            </p>
          </div>
        )}
      </div>

      {/* Tee / course update form */}
      <details className="group">
        <summary className="cursor-pointer font-sans text-[12px] font-medium text-primary list-none">
          {t('changeCourseLabel')}
        </summary>
        <form action={updateAction} className="mt-3 space-y-2">
          <input type="hidden" name="round_id" value={round.id} />
          <input type="hidden" name="league_id" value={leagueId} />

          {courseScope === 'multi_course' && (
            <div>
              <label className="block font-sans text-[12px] font-medium text-text mb-1">
                {t('courseLabel')}
              </label>
              <select
                name="course_id"
                defaultValue={round.courseId ?? ''}
                className="w-full rounded-xl border border-border bg-bg px-3 py-2 font-sans text-[14px] text-text focus:outline-none focus:ring-2 focus:ring-primary/30 min-h-[44px]"
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
              <label className="block font-sans text-[12px] font-medium text-text mb-1">
                {t('teeLabel')}
              </label>
              <select
                name="tee_box_id"
                defaultValue={round.teeBoxId ?? ''}
                className="w-full rounded-xl border border-border bg-bg px-3 py-2 font-sans text-[14px] text-text focus:outline-none focus:ring-2 focus:ring-primary/30 min-h-[44px]"
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
            <p className="font-sans text-[12px] text-danger">{updateState.error}</p>
          )}
          <SubmitButton variant="secondary" className="text-sm px-4 py-2 min-h-[44px]" pendingLabel={t('savePending')}>
            {t('saveButton')}
          </SubmitButton>
        </form>
      </details>

      {/* Override window form */}
      <details className="group">
        <summary className="cursor-pointer font-sans text-[12px] font-medium text-primary list-none">
          {t('extendWindowLabel')}
        </summary>
        <form action={overrideAction} className="mt-3 space-y-2">
          <input type="hidden" name="round_id" value={round.id} />
          <input type="hidden" name="league_id" value={leagueId} />

          <div className="min-w-0">
            <label className="block font-sans text-[12px] font-medium text-text mb-1">
              {t('newDeadlineLabel')}
            </label>
            {/* iOS: native datetime-local strekker seg utenfor kortet uten
                appearance-none + min-w-0 (samme fiks som #453). */}
            <input
              type="datetime-local"
              name="closes_at"
              required
              defaultValue={toDatetimeLocal(round.closesAt)}
              className="w-full min-w-0 appearance-none rounded-xl border border-border bg-bg px-3 py-2 font-sans text-[14px] text-text focus:outline-none focus:ring-2 focus:ring-primary/30 min-h-[44px]"
            />
          </div>

          {overrideState.error && overrideState.error !== '' && (
            <p className="font-sans text-[12px] text-danger">{overrideState.error}</p>
          )}
          <SubmitButton variant="secondary" className="text-sm px-4 py-2 min-h-[44px]" pendingLabel={t('savePending')}>
            {t('saveDeadlineButton')}
          </SubmitButton>
        </form>
      </details>
    </div>
  );
}
