'use client';

import { useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { FormSection } from '@/components/ui/FormSection';
import { PillRadio } from '@/components/ui/PillRadio';
import { SwitchRow } from '@/components/ui/Switch';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { formatShortDayMonthLocale, intlLocaleTag } from '@/lib/i18n/format';
import { isTeeOffInPast } from '@/lib/games/gamePayload';
import { moveGameChoices, movedTeeOffIso } from '@/lib/games/moveGameChoices';
import type { AppLocale } from '@/i18n/routing';

const OTHER = 'other';

/** «Lør. 3. okt» (nb) / «Sat 3 Oct» (en) for an Oslo day «YYYY-MM-DD». */
function dayLabel(day: string, locale: AppLocale): string {
  // Noon UTC is the same calendar day in Oslo all year.
  const noon = new Date(`${day}T12:00:00Z`);
  const tag = intlLocaleTag(locale);
  const weekday = new Intl.DateTimeFormat(tag, { timeZone: 'Europe/Oslo', weekday: 'short' }).format(noon);
  const capitalised = weekday.charAt(0).toLocaleUpperCase(tag) + weekday.slice(1);
  return `${capitalised} ${formatShortDayMonthLocale(noon, locale)}`;
}

/**
 * The quick choices and the message on «Flytt runden» (#2480). Day and time
 * travel in two always-mounted hidden inputs, so the value reaches FormData
 * whichever chip or field set it (#1011). The button stays off until the day
 * or the time has changed, and while the choice lies in the past (the server
 * checks again with the same `isTeeOffInPast`).
 *
 * «Si fra til gjengen» starts on. Without anyone to tell (`namesLine` null:
 * only you, or only guests) the switch is not drawn and nobody is told.
 */
export function MoveGameForm({
  action,
  gameName,
  teeOffIso,
  namesLine,
}: {
  action: (formData: FormData) => void | Promise<void>;
  gameName: string;
  teeOffIso: string;
  namesLine: string | null;
}) {
  const t = useTranslations('game.move');
  const locale = useLocale() as AppLocale;
  const choices = useMemo(() => moveGameChoices(teeOffIso), [teeOffIso]);

  const [day, setDay] = useState(choices.currentDay);
  const [time, setTime] = useState(choices.currentTime);
  const [dayChoice, setDayChoice] = useState<string>(choices.currentDay);
  const [timeChoice, setTimeChoice] = useState<string>(choices.currentTime);
  const [notify, setNotify] = useState(true);

  const canNotify = namesLine != null;
  const telling = canNotify && notify;
  const chosenIso = movedTeeOffIso(day, time);
  const inPast = chosenIso != null && isTeeOffInPast(chosenIso);
  const changed = day !== choices.currentDay || time !== choices.currentTime;
  const today = moveGameChoices(new Date().toISOString()).currentDay;

  const fieldClass =
    'mt-2.5 h-11 w-full rounded-xl border border-field-border bg-surface px-3.5 font-sans text-[15px] tabular-nums text-text';

  return (
    <form action={action} data-testid="move-game-form">
      <input type="hidden" name="day" value={day} />
      <input type="hidden" name="time" value={time} />
      {telling && <input type="hidden" name="notify" value="1" />}

      <div className="-mx-1">
        <FormSection legend={t('dayLegend')} variant="bare">
          <div className="flex flex-wrap gap-2">
            {choices.days.map((d) => (
              <PillRadio
                key={d}
                name="day_choice"
                value={d}
                checked={dayChoice === d}
                disabled={d < today}
                onChange={() => {
                  setDayChoice(d);
                  setDay(d);
                }}
              >
                {dayLabel(d, locale)}
              </PillRadio>
            ))}
            <PillRadio
              name="day_choice"
              value={OTHER}
              checked={dayChoice === OTHER}
              onChange={() => setDayChoice(OTHER)}
            >
              {t('otherDay')}
            </PillRadio>
          </div>
          {dayChoice === OTHER && (
            <input
              type="date"
              aria-label={t('otherDayInput')}
              data-testid="move-other-day"
              value={day}
              min={today}
              onChange={(e) => setDay(e.target.value)}
              className={fieldClass}
            />
          )}
        </FormSection>

        <FormSection legend={t('timeLegend')} variant="bare">
          <div className="flex flex-wrap gap-2">
            {choices.times.map((tm) => {
              const iso = movedTeeOffIso(day, tm);
              return (
                <PillRadio
                  key={tm}
                  name="time_choice"
                  value={tm}
                  checked={timeChoice === tm}
                  disabled={iso != null && isTeeOffInPast(iso)}
                  onChange={() => {
                    setTimeChoice(tm);
                    setTime(tm);
                  }}
                >
                  {tm}
                </PillRadio>
              );
            })}
            <PillRadio
              name="time_choice"
              value={OTHER}
              checked={timeChoice === OTHER}
              onChange={() => setTimeChoice(OTHER)}
            >
              {t('otherTime')}
            </PillRadio>
          </div>
          {timeChoice === OTHER && (
            <input
              type="time"
              aria-label={t('otherTimeInput')}
              data-testid="move-other-time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className={fieldClass}
            />
          )}
          {inPast && (
            <p role="alert" className="mt-2 px-1 font-sans text-[13px] font-semibold text-warning-text">
              {t('inPast')}
            </p>
          )}
        </FormSection>

        {canNotify && (
          <FormSection legend={t('noticeLegend')} variant="list">
            <SwitchRow
              compact
              checked={notify}
              onChange={(e) => setNotify(e.target.checked)}
              title={t('notifyTitle')}
              description={namesLine}
            />
            {notify && chosenIso && (
              <p data-testid="move-preview" className="bg-surface-2 px-3.5 py-3 font-sans text-sm leading-[1.45] text-text">
                {t.rich('preview', {
                  gameName,
                  teeOffAt: Date.parse(chosenIso),
                  b: (chunks) => <b className="font-semibold">{chunks}</b>,
                })}
              </p>
            )}
          </FormSection>
        )}
      </div>

      {/* Pinned to the bottom as on the artboard; the page hides the bottom
          nav. `fixed`, not `sticky`: the bar is one button, always the same
          height, and AppShell's bottom padding already clears it. */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-bg">
        <div className="mx-auto max-w-md px-4 pt-3 pb-[calc(22px+env(safe-area-inset-bottom,0px))]">
          <SubmitButton
            size="large"
            className="w-full"
            data-testid="move-submit"
            disabled={!changed || !chosenIso || inPast}
            pendingLabel={t('pending')}
          >
            {telling ? t('submitNotify') : t('submit')}
          </SubmitButton>
        </div>
      </div>
    </form>
  );
}
