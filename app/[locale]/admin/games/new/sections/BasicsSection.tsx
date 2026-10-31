'use client';

/**
 * BasicsSection — «Hvor og når?»: steg 3 i veiviseren, og delene «Bane» og
 * «Navn og tid» i «Rediger spill» (#2448, `Nyttspill-forslag-bane`).
 *
 * Ansvar: spillnavn (valgfritt), de sist brukte banene som kort med søk
 * (RecentCoursePicker), tee-knappene (TeeButtons), hurtigvalgene for tee-off
 * (TeeOffQuickPicks) og «Shotgun-start» (#2258). Begge skjemaene bruker denne
 * seksjonen, så de to flatene ikke kan skli fra hverandre.
 * Wizard-en skjuler navnefeltet i steg 2. «Synlighet under runden» og
 * «Sideturnering» bor i AdvancedSettingsSection — begge flatene går dit
 * (#909), og den døde inline-kopien her er fjernet (#1660).
 */

import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import type { CourseOption } from '../GameForm';
import type { GameFormState } from '../useGameFormState';
import { Input } from '@/components/ui/Input';
import { CARD_FIELD_ERROR, CARD_FIELD_HINT, CARD_FIELD_LABEL } from '@/components/ui/CardField';
import type { RecentCourse } from '@/lib/wizard/recentCourseCards';
import { RecentCoursePicker } from './RecentCoursePicker';
import { TeeButtons } from './TeeButtons';
import { TeeOffQuickPicks } from './TeeOffQuickPicks';

type Props = {
  state: GameFormState;
  courses: CourseOption[];
  /** #2448: the courses you used last (`getCourseAndTimeData`). */
  recentCourses: RecentCourse[];
  /**
   * #2448: Oslo's «now» from the server, «YYYY-MM-DDTHH:mm». Empty → no
   * quick-pick days, only «Annen dag».
   */
  teeOffNow: string;
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
  /**
   * #2322: «Rediger spill» opens one part at a time. `'nameAndTime'` shows the
   * name, tee-off and shotgun start; `'course'` the course and tee. The other
   * part's fields stay mounted in a `hidden` box, so a save still posts them
   * (unmounting them would reset them, the #2258 class). Default `'all'`.
   */
  visibleFields?: 'all' | 'nameAndTime' | 'course';
};

/** Shows its fields, or keeps them mounted and posted but out of sight. */
function FieldGroup({ visible, children }: { visible: boolean; children: ReactNode }) {
  return visible ? <>{children}</> : <div hidden>{children}</div>;
}

const TEE_OFF_DESC_ID = 'scheduled_tee_off_at-desc';

export function BasicsSection({
  state,
  courses,
  recentCourses,
  teeOffNow,
  showName = true,
  hideHeading = false,
  visibleFields = 'all',
}: Props) {
  const t = useTranslations('wizard.sections.basics');
  const {
    name,
    setName,
    courseId,
    setCourseId,
    teeBoxId,
    setTeeBoxId,
    scheduledTeeOffAt,
    setScheduledTeeOffAt,
    teeOffNow: teeOffNowChosen,
    setTeeOffNow,
    allowTeeOffNow,
    startType,
    setStartType,
    selectedCourse,
    availableTees,
  } = state;

  const teeOffError = state.teeOffInPast ? t('teeOffPastError') : undefined;

  const showNameAndTime = visibleFields !== 'course';
  const showCourse = visibleFields !== 'nameAndTime';

  const fields = (
    <>
      {/* The three values the server reads, posted whatever part is open:
          the cards, buttons and pills have no `name`. The wizard mirrors
          them in FormDataInputs too, with the same values (#1011). */}
      <input type="hidden" name="course_id" value={courseId} />
      <input type="hidden" name="tee_box_id" value={teeBoxId} />
      <input type="hidden" name="scheduled_tee_off_at" value={scheduledTeeOffAt} />
      {/* #2463: «Nå», set when the server publishes. */}
      <input type="hidden" name="tee_off_now" value={teeOffNowChosen ? '1' : ''} />

      <FieldGroup visible={showNameAndTime}>
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
      </FieldGroup>

      <FieldGroup visible={showCourse}>
        <RecentCoursePicker
          courses={courses}
          recentCourses={recentCourses}
          courseId={courseId}
          onSelect={setCourseId}
          today={teeOffNow.slice(0, 10)}
        />
        <TeeButtons
          tees={availableTees}
          hasCourse={selectedCourse != null}
          teeBoxId={teeBoxId}
          onSelect={setTeeBoxId}
        />
      </FieldGroup>

      <FieldGroup visible={showNameAndTime}>
        <TeeOffQuickPicks
          value={scheduledTeeOffAt}
          onChange={setScheduledTeeOffAt}
          teeOffNow={teeOffNow}
          allowNow={allowTeeOffNow}
          now={teeOffNowChosen}
          onNowChange={setTeeOffNow}
          describedBy={TEE_OFF_DESC_ID}
        >
          {/* No artboard draws the hint, the error or «Shotgun-start»; they
              stay under the rows as they stood under the field (#2426).
              «Nå» draws its own box instead of the hint (#2463). */}
          {teeOffNowChosen ? null : teeOffError ? (
            <p id={TEE_OFF_DESC_ID} role="alert" className={`${CARD_FIELD_ERROR} px-1`}>
              {teeOffError}
            </p>
          ) : (
            <p id={TEE_OFF_DESC_ID} className={`${CARD_FIELD_HINT} px-1`}>
              {t('teeOffHint')}
            </p>
          )}

          {/* #2258: «Shotgun-start», off by default. The whole label is the
              44 px target, and the hint is read as its description. No
              `name`: the form reads the always-mounted `start_type` mirror in
              GameWizard / GameForm. */}
          <label className="mt-3 flex min-h-11 cursor-pointer items-start gap-2.5 px-1">
            <input
              type="checkbox"
              checked={startType === 'shotgun'}
              onChange={(e) => setStartType(e.target.checked ? 'shotgun' : 'first_tee')}
              className="-mt-0.5 h-5 w-5 flex-shrink-0 accent-primary"
              aria-labelledby="shotgun-start-label"
              aria-describedby="shotgun-start-hint"
              data-testid="shotgun-start"
            />
            <span>
              <span id="shotgun-start-label" className={CARD_FIELD_LABEL}>
                {t('shotgunLabel')}
              </span>
              <span id="shotgun-start-hint" className="block font-sans text-xs leading-[1.4] text-muted">
                {t('shotgunHint')}
              </span>
            </span>
          </label>
        </TeeOffQuickPicks>
      </FieldGroup>
    </>
  );

  // #909: GameForm wraps the section in a panel that carries the title, so
  // there the kickers stand inside it under the name. The wizard's step 3
  // draws them straight under «Hvor og når?» (#2448).
  if (hideHeading) {
    return <section className="flex flex-col gap-3.5">{fields}</section>;
  }
  return <div className="flex flex-col">{fields}</div>;
}
