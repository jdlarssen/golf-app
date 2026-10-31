'use client';

import { useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { FormSection } from '@/components/ui/FormSection';
import { PillRadio } from '@/components/ui/PillRadio';
import { formatDayChoiceLocale } from '@/lib/i18n/format';
import { isTeeOffInPast, parseOsloDateTimeLocal } from '@/lib/games/gamePayload';
import { movedTeeOffIso } from '@/lib/games/moveGameChoices';
import { teeOffQuickPicks } from '@/lib/games/teeOffQuickPicks';
import type { AppLocale } from '@/i18n/routing';

const OTHER = 'other';

const subscribeNever = () => () => {};

/** The day and the time of a «YYYY-MM-DDTHH:mm» value; empty parts when it is not one. */
function splitTeeOff(value: string): { day: string; time: string } {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(value);
  return m ? { day: m[1], time: m[2] } : { day: '', time: '' };
}

/** The instant of an Oslo «YYYY-MM-DDTHH:mm», or NaN. */
function osloMs(local: string): number {
  try {
    return Date.parse(parseOsloDateTimeLocal(local));
  } catch {
    return Number.NaN;
  }
}

/**
 * «TEE-OFF» on «Hvor og når?» (#2448, `Nyttspill-forslag-bane`): a row of
 * days («I dag», «I morgen», «Lør. 7. nov», «Annen dag») and a row of times
 * («08:00», «09:00», «10:00», «Annen tid»). «Annen dag» and «Annen tid» open
 * a date or time field under the row, as on «Flytt runden» (#2480).
 *
 * The pills show the tee-off that is set, wherever it came from (#2438's
 * Saturday 09:00, a draft, the game being edited): a day or time outside the
 * picks marks «Annen …» with the value in the field. With no tee-off yet (a
 * rematch, #1007) nothing is marked, and a lone day or time waits here until
 * the other half is chosen. The pills post nothing: `scheduled_tee_off_at`
 * travels in BasicsSection's hidden field.
 *
 * `teeOffNow` is Oslo's «now» from the server, so the server and the client
 * draw the same days (defaultTeeOff.ts). With «I dag» chosen, a time that has
 * passed cannot be chosen (`isTeeOffInPast`, the server's rule, against the
 * device's clock once the page has hydrated).
 */
export function TeeOffQuickPicks({
  value,
  onChange,
  teeOffNow,
  describedBy,
  children,
}: {
  value: string;
  onChange: (next: string) => void;
  teeOffNow: string;
  /** The id of the hint or error under the rows. */
  describedBy?: string;
  /** What stands under the rows: the hint, the error and «Shotgun-start». */
  children?: ReactNode;
}) {
  const t = useTranslations('wizard.sections.basics');
  const locale = useLocale() as AppLocale;
  const picks = useMemo(() => teeOffQuickPicks(teeOffNow), [teeOffNow]);
  const today = picks.days[0] ?? '';
  // The #928 pattern (useGameFormState's `teeOffInPast`): the server's «now»
  // until hydration, so both render the same pills; the device's clock after.
  const mounted = useSyncExternalStore(subscribeNever, () => true, () => false);
  const serverNowMs = osloMs(teeOffNow);

  // A half chosen before the other (only while no tee-off is set).
  const [pending, setPending] = useState({ day: '', time: '' });
  const [otherDayOpen, setOtherDayOpen] = useState(false);
  const [otherTimeOpen, setOtherTimeOpen] = useState(false);

  const { day, time } = value ? splitTeeOff(value) : pending;

  function commit(nextDay: string, nextTime: string) {
    const full = nextDay && nextTime && movedTeeOffIso(nextDay, nextTime) ? `${nextDay}T${nextTime}` : '';
    setPending(full ? { day: '', time: '' } : { day: nextDay, time: nextTime });
    if (full !== value) onChange(full);
  }

  const dayChoice = otherDayOpen || (day !== '' && !picks.days.includes(day)) ? OTHER : day;
  const timeChoice = otherTimeOpen || (time !== '' && !picks.times.includes(time)) ? OTHER : time;

  const dayText = (d: string, i: number) =>
    i === 0 ? t('today') : i === 1 ? t('tomorrow') : formatDayChoiceLocale(d, locale);
  const timePassed = (tm: string) => {
    if (day !== today) return false;
    const iso = movedTeeOffIso(day, tm);
    if (iso == null) return false;
    return mounted ? isTeeOffInPast(iso) : isTeeOffInPast(iso, serverNowMs);
  };

  const fieldClass =
    'mt-2 h-11 w-full min-w-0 appearance-none rounded-xl border border-field-border bg-surface px-3.5 font-sans text-base tabular-nums text-text [&::-webkit-date-and-time-value]:text-left';

  return (
    <FormSection legend={t('teeOffLabel')} variant="bare">
      <div role="radiogroup" aria-label={t('dayGroup')} aria-describedby={describedBy} className="flex flex-wrap gap-2">
        {picks.days.map((d, i) => (
          <PillRadio
            key={d}
            value={d}
            checked={dayChoice === d}
            onChange={() => {
              setOtherDayOpen(false);
              commit(d, time);
            }}
          >
            {dayText(d, i)}
          </PillRadio>
        ))}
        <PillRadio value={OTHER} checked={dayChoice === OTHER} onChange={() => setOtherDayOpen(true)}>
          {t('otherDay')}
        </PillRadio>
      </div>
      {dayChoice === OTHER && (
        <input
          type="date"
          aria-label={t('otherDayInput')}
          data-testid="tee-off-other-day"
          value={day}
          min={today || undefined}
          onChange={(e) => commit(e.target.value, time)}
          className={fieldClass}
        />
      )}

      <div
        role="radiogroup"
        aria-label={t('timeGroup')}
        aria-describedby={describedBy}
        className="mt-2 flex flex-wrap gap-2"
      >
        {picks.times.map((tm) => (
          <PillRadio
            key={tm}
            value={tm}
            checked={timeChoice === tm}
            disabled={timePassed(tm)}
            onChange={() => {
              setOtherTimeOpen(false);
              commit(day, tm);
            }}
          >
            {tm}
          </PillRadio>
        ))}
        <PillRadio value={OTHER} checked={timeChoice === OTHER} onChange={() => setOtherTimeOpen(true)}>
          {t('otherTime')}
        </PillRadio>
      </div>
      {timeChoice === OTHER && (
        <input
          type="time"
          aria-label={t('otherTimeInput')}
          data-testid="tee-off-other-time"
          value={time}
          onChange={(e) => commit(day, e.target.value)}
          className={fieldClass}
        />
      )}
      {children}
    </FormSection>
  );
}
