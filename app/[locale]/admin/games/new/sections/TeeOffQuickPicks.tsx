'use client';

import { useId, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { FormSection } from '@/components/ui/FormSection';
import { PillRadio } from '@/components/ui/PillRadio';
import { isTeeOffInPast, parseOsloDateTimeLocal } from '@/lib/games/gamePayload';
import { movedTeeOffIso } from '@/lib/games/moveGameChoices';
import { teeOffQuickPicks } from '@/lib/games/teeOffQuickPicks';

const OTHER = 'other';
const NOW = 'now';

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
 * days («I dag», «I morgen», «Annen dag») and a row of times («08:00»,
 * «09:00», «10:00», «Annen tid»). «Annen dag» and «Annen tid» open a date or
 * time field under the row, as on «Flytt runden» (#2480).
 *
 * #2463 (`Nyttspill-forslag-spill-na`): with `allowNow` the day row starts
 * with «Nå». Chosen, it hides the time row and the fields and shows «Dere står
 * på banen» instead: the tee-off is set when the game is published
 * (`resolveTeeOffForSave`), so it travels as BasicsSection's `tee_off_now`
 * field, never as a time here.
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
  allowNow = false,
  now = false,
  onNowChange,
  describedBy,
  children,
}: {
  value: string;
  onChange: (next: string) => void;
  teeOffNow: string;
  /** #2463: offer «Nå» first on the day row (Kompis and Solo in the wizard). */
  allowNow?: boolean;
  /** #2463: «Nå» is chosen. Only read with `allowNow`. */
  now?: boolean;
  onNowChange?: (next: boolean) => void;
  /** The id of the hint or error under the rows. */
  describedBy?: string;
  /** What stands under the rows: the hint, the error and «Shotgun-start». */
  children?: ReactNode;
}) {
  const t = useTranslations('wizard.sections.basics');
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
  const nowBoxId = useId();
  const nowChosen = allowNow && now;

  const { day, time } = value ? splitTeeOff(value) : pending;

  function commit(nextDay: string, nextTime: string) {
    const full = nextDay && nextTime && movedTeeOffIso(nextDay, nextTime) ? `${nextDay}T${nextTime}` : '';
    setPending(full ? { day: '', time: '' } : { day: nextDay, time: nextTime });
    if (full !== value) onChange(full);
  }

  const dayChoice = nowChosen
    ? NOW
    : otherDayOpen || (day !== '' && !picks.days.includes(day))
      ? OTHER
      : day;
  const timeChoice = otherTimeOpen || (time !== '' && !picks.times.includes(time)) ? OTHER : time;

  const dayText = (i: number) => (i === 0 ? t('today') : t('tomorrow'));
  const timePassed = (tm: string) => {
    if (day !== today) return false;
    const iso = movedTeeOffIso(day, tm);
    if (iso == null) return false;
    return mounted ? isTeeOffInPast(iso) : isTeeOffInPast(iso, serverNowMs);
  };

  const fieldClass =
    'mt-2 h-11 w-full min-w-0 appearance-none rounded-xl border border-field-border bg-surface px-3.5 font-sans text-base tabular-nums text-text [&::-webkit-date-and-time-value]:text-left';

  /** Leaving «Nå» for a day: the day and time work as without it. */
  function leaveNow() {
    if (nowChosen) onNowChange?.(false);
  }

  return (
    <FormSection legend={t('teeOffLabel')} variant="bare">
      <div
        role="radiogroup"
        aria-label={t('dayGroup')}
        aria-describedby={nowChosen ? nowBoxId : describedBy}
        className="flex flex-wrap gap-2"
      >
        {allowNow && (
          <PillRadio
            value={NOW}
            checked={nowChosen}
            onChange={() => {
              setOtherDayOpen(false);
              setOtherTimeOpen(false);
              setPending({ day: '', time: '' });
              onNowChange?.(true);
            }}
          >
            {t('teeOffNow')}
          </PillRadio>
        )}
        {picks.days.map((d, i) => (
          <PillRadio
            key={d}
            value={d}
            checked={dayChoice === d}
            onChange={() => {
              leaveNow();
              setOtherDayOpen(false);
              commit(d, time);
            }}
          >
            {dayText(i)}
          </PillRadio>
        ))}
        <PillRadio
          value={OTHER}
          checked={dayChoice === OTHER}
          onChange={() => {
            leaveNow();
            setOtherDayOpen(true);
          }}
        >
          {t('otherDay')}
        </PillRadio>
      </div>
      {nowChosen && (
        <div id={nowBoxId} className="mt-3 flex flex-col gap-1 rounded-[14px] bg-primary-soft px-3.5 py-3">
          <p className="font-sans text-[15px] font-semibold leading-[normal] text-primary">
            {t('teeOffNowTitle')}
          </p>
          <p className="font-sans text-[13px] leading-[1.45] text-text">{t('teeOffNowBody')}</p>
        </div>
      )}
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

      {!nowChosen && (
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
      )}
      {!nowChosen && timeChoice === OTHER && (
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
