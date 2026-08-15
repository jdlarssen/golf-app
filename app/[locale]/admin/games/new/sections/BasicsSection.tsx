'use client';

/**
 * BasicsSection — første kort/seksjon i opprett-spill-flyten.
 *
 * Ansvar: spillnavn (valgfritt), bane- og tee-select og tee-off-datetime.
 * Wizard-en skjuler navnefeltet i steg 2. «Synlighet under runden» og
 * «Sideturnering» bor i AdvancedSettingsSection — begge flatene går dit
 * (#909), og den døde inline-kopien her er fjernet (#1660).
 */

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import type { CourseOption } from '../GameForm';
import type { GameFormState } from '../useGameFormState';
import { Input } from '@/components/ui/Input';
import { SmartLink } from '@/components/ui/SmartLink';

type Props = {
  state: GameFormState;
  courses: CourseOption[];
  /**
   * Skjul spillnavn-feltet. Wizard-en flytter navnet til steg 4 (summary).
   * GameForm beholder navn øverst i seksjonen.
   */
  showName?: boolean;
  /**
   * #909: skjul seksjons-headingen. GameForm wrapper seksjonen i et
   * Disclosure-panel som allerede bærer tittelen. Default false.
   */
  hideHeading?: boolean;
};

/** Current browser-local wall-clock as a `datetime-local` `min` ('YYYY-MM-DDTHH:mm'). */
function getLocalDatetimeMin(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

function formatRatingBadge(tee: {
  has_mens: boolean;
  has_ladies: boolean;
  has_juniors: boolean;
}): string {
  const parts: string[] = [];
  if (tee.has_mens) parts.push('herre');
  if (tee.has_ladies) parts.push('dame');
  if (tee.has_juniors) parts.push('junior');
  return parts.join(' · ');
}

export function BasicsSection({
  state,
  courses,
  showName = true,
  hideHeading = false,
}: Props) {
  const t = useTranslations('wizard.sections.basics');
  const {
    name,
    setName,
    courseId,
    setCourseId,
    teeBoxId,
    setTeeBoxId,
    setPlayerGenders,
    scheduledTeeOffAt,
    setScheduledTeeOffAt,
    selectedCourse,
    availableTees,
  } = state;

  // #902: nudge the native datetime-local picker away from past tee-offs by
  // setting `min` to "now". Done imperatively in an effect (after mount) rather
  // than as a render prop: the SSR HTML carries no `min`, so adding it
  // client-side avoids a hydration mismatch, and a direct DOM write keeps it out
  // of React state (no `react-hooks/set-state-in-effect`). Browser-local is
  // correct here — it's the user's device, not the UTC server. UX hint only; the
  // server action in actions.ts is the authoritative guard.
  useEffect(() => {
    const el = document.getElementById(
      'scheduled_tee_off_at',
    ) as HTMLInputElement | null;
    if (el) el.min = getLocalDatetimeMin();
  }, []);

  return (
    <section className="space-y-4">
      {!hideHeading && (
        <h2 className="text-sm font-medium text-text">{t('heading')}</h2>
      )}
      {showName && (
        <Input
          id="name"
          name="name"
          type="text"
          label={t('gameNameLabel')}
          placeholder={t('gameNamePlaceholder')}
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
      )}

      <div>
        <label
          htmlFor="course_id"
          className="block text-sm font-medium text-text mb-1.5"
        >
          {t('courseLabel')}
        </label>
        <select
          id="course_id"
          name="course_id"
          value={courseId}
          onChange={(e) => setCourseId(e.target.value)}
          required
          className="w-full rounded-xl border px-3.5 py-2.5 bg-surface text-text border-border focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent transition-[border-color,box-shadow] duration-150"
        >
          <option value="">{t('coursePlaceholder')}</option>
          {courses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <p className="mt-1.5 text-xs text-muted">
          {t('courseNotFoundHint')}{' '}
          <SmartLink
            href="/opprett-bane"
            className="underline underline-offset-2 hover:text-text"
          >
            {t('courseCreateLink')}
          </SmartLink>
        </p>
      </div>

      <div>
        <label htmlFor="tee_box_id" className="block text-sm font-medium text-text mb-1.5">
          {t('teeLabel')}
        </label>
        <select
          id="tee_box_id"
          name="tee_box_id"
          value={teeBoxId}
          onChange={(e) => {
            setTeeBoxId(e.target.value);
            setPlayerGenders({});
          }}
          disabled={!selectedCourse}
          required
          className="w-full rounded-xl border px-3.5 py-2.5 bg-surface text-text border-border focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent transition-[border-color,box-shadow] duration-150 disabled:opacity-50"
        >
          <option value="">{selectedCourse ? t('teePlaceholderWithCourse') : t('teePlaceholderNoCourse')}</option>
          {availableTees.map((tee) => (
            <option key={tee.id} value={tee.id}>
              {tee.name} ({formatRatingBadge(tee)})
            </option>
          ))}
        </select>
      </div>

      {/* `datetime-local` emits 'YYYY-MM-DDTHH:mm' in browser local time (no
          offset). Server interprets in Europe/Oslo before persisting as
          timestamptz. See actions.ts. */}
      <Input
        id="scheduled_tee_off_at"
        name="scheduled_tee_off_at"
        type="datetime-local"
        label={t('teeOffLabel')}
        value={scheduledTeeOffAt}
        onChange={(e) => setScheduledTeeOffAt(e.target.value)}
        hint={t('teeOffHint')}
        error={state.teeOffInPast ? t('teeOffPastError') : undefined}
        // iOS: native datetime-local ignorerer width:100% og strekker seg
        // utenfor kortet. appearance-none + min-w-0 krymper kontrollen til
        // containeren (samme fiks som dato-feltene i CreateLigaForm, #453).
        inputClassName="min-w-0 appearance-none"
      />
    </section>
  );
}
