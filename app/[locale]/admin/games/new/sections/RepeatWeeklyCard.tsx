'use client';

/**
 * #2460 «Gjenta hver uke»: the switch on step 5 «Klar?» and in «Rediger spill»
 * (Premier og innstillinger). With it on, the line under it says when the next
 * round is: the tee-off plus seven days, the same weekday and time
 * (`nextWeeklyLocal`). The finish tail makes that round
 * (`lib/games/spawnWeeklyRepeat.ts`).
 *
 * The wizard posts the value through `FormDataInputs` (step 5 is not mounted
 * while you are on the other steps), so it leaves `name` out. GameForm has no
 * mirror and passes `name="repeat_weekly"`, so the checkbox posts itself.
 *
 * Drawn as `Nyttspill-forslag-gjenta` (row 60 of the design canvas), with the
 * kicker in sentence case like «Innstillinger» (no capitals since 31.10).
 */

import { useLocale, useTranslations } from 'next-intl';
import { Kicker } from '@/components/ui/Kicker';
import { SwitchRow } from '@/components/ui/Switch';
import { formatTeeOffLongDate } from '@/lib/format/teeOff';
import { nextWeeklyLocal } from '@/lib/games/weeklyRepeat';

/** The line under the switch: when the next round is, or the same day a week later. */
export function useRepeatWeeklyNextText(): (scheduledTeeOffAt: string) => string {
  const t = useTranslations('wizard.ready.repeat');
  const locale = useLocale();
  return (scheduledTeeOffAt) => {
    const next = nextWeeklyLocal(scheduledTeeOffAt);
    const when = next ? formatTeeOffLongDate(next, locale) : null;
    return when ? t('next', { when }) : t('nextSameDay');
  };
}

export function RepeatWeeklyCard({
  checked,
  onChange,
  scheduledTeeOffAt,
  name,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  /** The tee-off field's Oslo wall clock (`YYYY-MM-DDTHH:mm`), or `''`. */
  scheduledTeeOffAt: string;
  /** GameForm only: the checkbox posts itself. */
  name?: string;
}) {
  const t = useTranslations('wizard.ready.repeat');
  const nextText = useRepeatWeeklyNextText();
  return (
    <>
      <Kicker className="px-1 pt-[18px] pb-2 leading-[normal]">{t('kicker')}</Kicker>
      <div
        data-focus-inset
        data-testid="repeat-weekly"
        className="overflow-hidden rounded-2xl border border-border bg-surface"
      >
        <SwitchRow
          tall
          name={name}
          value={name ? '1' : undefined}
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          title={t('title')}
          description={checked ? nextText(scheduledTeeOffAt) : undefined}
        />
      </div>
    </>
  );
}
