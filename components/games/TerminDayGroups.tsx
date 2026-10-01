import type { ReactNode } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { formatWeekdayDayMonthOsloLocale } from '@/lib/i18n/format';
import type { GameSocialProof } from '@/lib/games/socialProof';
import type { TerminDayLabel, TerminGroup } from '@/lib/games/terminliste';
import type { AppLocale } from '@/i18n/routing';
import { TerminRow } from './TerminRow';

/**
 * The terminliste's days (#2258): a heading per Oslo day («Lørdag 4. oktober»
 * «om 7 dager») over one white card of rows, «Dato ikke satt» last. Shared by
 * the terminliste, Hjem and the anonymous list, so the rows look the same on
 * all three.
 *
 * `bleed` widens the cards 4 px into the page gutter (16 px from the edge
 * instead of 20), as the terminliste page draws them. `firstClassName` is the
 * first section's top margin; the rest get 20 px.
 */
export function TerminDayGroups({
  groups,
  variant,
  now,
  socialProof = {},
  headingLevel = 'h2',
  bleed = false,
  firstClassName = '',
}: {
  groups: TerminGroup[];
  variant: 'player' | 'anon';
  now: Date;
  socialProof?: Record<string, GameSocialProof>;
  headingLevel?: 'h2' | 'h3';
  bleed?: boolean;
  firstClassName?: string;
}) {
  const t = useTranslations('discover');
  const locale = useLocale() as AppLocale;

  return (
    <>
      {groups.map((group, i) => (
        <section key={group.key} className={i === 0 ? firstClassName : 'mt-5'}>
          <TerminHeading
            as={headingLevel}
            title={
              group.kind === 'day'
                ? formatWeekdayDayMonthOsloLocale(group.teeOff, locale, now)
                : t('termin.undated')
            }
            label={group.kind === 'day' ? <DayLabel label={group.label} /> : null}
          />
          <TerminCard bleed={bleed}>
            {group.entries.map((entry) => (
              <TerminRow
                key={entry.id}
                entry={entry}
                variant={variant}
                socialProof={socialProof[entry.id]}
              />
            ))}
          </TerminCard>
        </section>
      ))}
    </>
  );
}

function DayLabel({ label }: { label: TerminDayLabel }) {
  const t = useTranslations('discover');
  if (label === null) return null;
  const text =
    label.kind === 'today'
      ? t('termin.today')
      : label.kind === 'tomorrow'
        ? t('termin.tomorrow')
        : t('termin.inDays', { days: label.days });
  return <span className="text-[12px] text-muted">{text}</span>;
}

/**
 * A day heading: the date in Fraunces 18/600 and, after it, the relative label.
 * Also heads «Mine forespørsler».
 */
export function TerminHeading({
  as: Tag = 'h2',
  title,
  label = null,
}: {
  as?: 'h2' | 'h3';
  title: string;
  label?: ReactNode;
}) {
  return (
    <Tag className="mb-2 flex items-baseline gap-[10px]">
      <span className="font-serif text-[18px] font-semibold text-text">{title}</span>
      {label}
    </Tag>
  );
}

/**
 * The white day card: no padding and no shadow, rows split by the warm
 * divider. Not `Card`, which always adds `p-6` and a shadow.
 */
export function TerminCard({ bleed = false, children }: { bleed?: boolean; children: ReactNode }) {
  return (
    <div
      className={`${bleed ? '-mx-1 ' : ''}overflow-hidden rounded-2xl border border-border bg-surface`}
    >
      <ul className="list-none divide-y divide-row-divider-warm p-0">{children}</ul>
    </div>
  );
}
