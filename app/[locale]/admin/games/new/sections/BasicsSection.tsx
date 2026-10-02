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
import { useLocale, useTranslations } from 'next-intl';
import type { CourseOption } from '../GameForm';
import type { GameFormState } from '../useGameFormState';
import { Input } from '@/components/ui/Input';
import { SmartLink } from '@/components/ui/SmartLink';
import { FormSection } from '@/components/ui/FormSection';
import {
  CARD_FIELD_CONTROL,
  CARD_FIELD_ERROR,
  CARD_FIELD_HINT,
  CARD_FIELD_LABEL,
  CardSelect,
} from '@/components/ui/CardField';
import { formatTeeOffFieldValue } from '@/lib/format/teeOff';

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

type BasicsT = ReturnType<typeof useTranslations<'wizard.sections.basics'>>;

function formatRatingBadge(
  tee: {
    has_mens: boolean;
    has_ladies: boolean;
    has_juniors: boolean;
  },
  t: BasicsT,
): string {
  const parts: string[] = [];
  if (tee.has_mens) parts.push(t('teeRatingMens'));
  if (tee.has_ladies) parts.push(t('teeRatingLadies'));
  if (tee.has_juniors) parts.push(t('teeRatingJuniors'));
  return parts.join(' · ');
}

export function BasicsSection({
  state,
  courses,
  showName = true,
  hideHeading = false,
}: Props) {
  const t = useTranslations('wizard.sections.basics');
  const locale = useLocale();
  const {
    name,
    setName,
    courseId,
    setCourseId,
    teeBoxId,
    setTeeBoxId,
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

  const teeOffError = state.teeOffInPast ? t('teeOffPastError') : undefined;
  const teeOffText = formatTeeOffFieldValue(scheduledTeeOffAt, locale);
  const teeOffBorder = teeOffError ? 'border-danger' : 'border-field-border';

  const fields = (
    <>
      {showName && (
        <Input
          id="name"
          name="name"
          type="text"
          variant="card"
          label={t('gameNameLabel')}
          placeholder={t('gameNamePlaceholder')}
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
      )}

      <CardSelect
        id="course_id"
        name="course_id"
        label={t('courseLabel')}
        value={courseId}
        onChange={(e) => setCourseId(e.target.value)}
        required
      >
        <option value="">{t('coursePlaceholder')}</option>
        {courses.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </CardSelect>
      {/* Pulled up under the field (the card's gap is 14 px, the hint sits
          6 px below), and 44 px high so the link is a full tap target. */}
      <p className="-mt-2 flex min-h-11 items-center gap-1 font-sans text-[13px] leading-[normal] text-muted">
        {t('courseNotFoundHint')}
        <SmartLink
          href="/opprett-bane"
          className="inline-flex min-h-11 items-center font-semibold text-primary underline"
        >
          {t('courseCreateLink')}
        </SmartLink>
      </p>

      {/* Without a course the tee field is faded as a whole, label too. */}
      <div className={selectedCourse ? undefined : 'opacity-[0.55]'}>
        <CardSelect
          id="tee_box_id"
          name="tee_box_id"
          label={t('teeLabel')}
          value={teeBoxId}
          onChange={(e) => setTeeBoxId(e.target.value)}
          disabled={!selectedCourse}
          required
        >
          <option value="">{selectedCourse ? t('teePlaceholderWithCourse') : t('teePlaceholderNoCourse')}</option>
          {availableTees.map((tee) => (
            <option key={tee.id} value={tee.id}>
              {tee.name} ({formatRatingBadge(tee, t)})
            </option>
          ))}
        </CardSelect>
      </div>

      {/* `datetime-local` emits 'YYYY-MM-DDTHH:mm' in browser local time (no
          offset). Server interprets in Europe/Oslo before persisting as
          timestamptz. See actions.ts.
          #2426: at rest the field shows the artboard's face — a calendar icon
          and «lør. 3. okt. 2026, 09:00», or «Velg dato og tid» when empty. The
          native input lies on top, invisible until it has focus: a tap or
          click still lands on it and opens the phone's own picker, and while
          it has focus it shows itself, so keyboard entry works as before. */}
      <div>
        <label htmlFor="scheduled_tee_off_at" className={CARD_FIELD_LABEL}>
          {t('teeOffLabel')}
        </label>
        <div className="relative">
          <div
            aria-hidden="true"
            className={`${CARD_FIELD_CONTROL} ${teeOffBorder} flex items-center gap-2 ${teeOffText ? 'text-text' : 'text-muted'}`}
          >
            <span className="flex text-muted">
              <CalendarIcon />
            </span>
            <span className="min-w-0 flex-1 truncate">{teeOffText ?? t('teeOffPlaceholder')}</span>
          </div>
          <input
            id="scheduled_tee_off_at"
            name="scheduled_tee_off_at"
            type="datetime-local"
            value={scheduledTeeOffAt}
            onChange={(e) => setScheduledTeeOffAt(e.target.value)}
            aria-describedby="scheduled_tee_off_at-desc"
            aria-invalid={teeOffError ? true : undefined}
            // iOS: native datetime-local ignores width:100% and stretches out
            // of the card. appearance-none + min-w-0 shrink the control to its
            // box (same fix as the date fields in CreateLigaForm, #453).
            className={`${CARD_FIELD_CONTROL} ${teeOffBorder} absolute inset-0 min-w-0 appearance-none text-text opacity-0 focus:opacity-100 [&::-webkit-date-and-time-value]:text-left`}
          />
        </div>
        {teeOffError ? (
          <p id="scheduled_tee_off_at-desc" className={CARD_FIELD_ERROR}>
            {teeOffError}
          </p>
        ) : (
          <p id="scheduled_tee_off_at-desc" className={CARD_FIELD_HINT}>
            {t('teeOffHint')}
          </p>
        )}
      </div>
    </>
  );

  // #909: GameForm wraps the section in a Disclosure that carries the title,
  // so there the fields stand on their own. The wizard's step 3 draws them in
  // a card under the «BANE OG TIDSPUNKT» kicker (#2426).
  if (hideHeading) {
    return <section className="flex flex-col gap-3.5">{fields}</section>;
  }
  return (
    <FormSection legend={t('heading')} gap="lg">
      {fields}
    </FormSection>
  );
}

function CalendarIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </svg>
  );
}
