import { useLocale, useTranslations } from 'next-intl';
import { SmartLink } from '@/components/ui/SmartLink';
import { formatListLocale } from '@/lib/i18n/format';
import type { WeekSummary } from '@/lib/admin/morningReport';
import type { AppLocale } from '@/i18n/routing';

// «Denne uka» (#2345): the forest-green card on top of the morning report.
// Presentational (data as props, sync translations), so it renders in a unit
// test without Supabase; WeekCard.tsx reads the RPC.

export function WeekCardView({ summary }: { summary: WeekSummary }) {
  const t = useTranslations('admin.dashboard.morning');
  const locale = useLocale() as AppLocale;

  const diff = t('weekDiff', {
    direction: summary.diff > 0 ? 'more' : summary.diff < 0 ? 'fewer' : 'same',
    n: Math.abs(summary.diff),
  });
  const sentences: string[] = [];
  // «… av dem» needs rounds to refer to; without the field the part drops.
  if (summary.byOthers !== undefined && summary.finished > 0) {
    sentences.push(t('weekByOthers', { n: summary.byOthers }));
  }
  sentences.push(
    summary.publicSignups
      ? t('weekDiffAndSignupsSentence', {
          diff,
          signups: t('weekSignups', { n: summary.publicSignups }),
        })
      : t('weekDiffSentence', { diff }),
  );

  return (
    <section
      aria-labelledby="morning-week"
      data-testid="morning-week"
      data-focus-surface="strong"
      className="-mx-1 mt-3.5 flex flex-col gap-2.5 rounded-[18px] bg-surface-strong p-4 text-on-strong dark:ring-1 dark:ring-border"
    >
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 id="morning-week" className="font-sans text-xs font-semibold text-on-strong/80">
            {t('weekHeading')}
          </h2>
          <p className="mt-1 flex items-baseline gap-2">
            <span className="font-serif text-[44px] font-semibold leading-none tabular-nums">
              {summary.finished}
            </span>
            <span className="text-[15px]">{t('weekFinished', { n: summary.finished })}</span>
          </p>
        </div>
        <TrendCurve
          values={summary.trend}
          label={t('weekTrendLabel', {
            list: formatListLocale(summary.trend.map(String), locale),
          })}
        />
      </div>
      <p
        data-testid="morning-week-sentence"
        className="border-t border-on-strong/25 pt-2.5 text-sm leading-[1.45]"
      >
        {sentences.join(' ')}
      </p>
      {/* Owner's answer: «Alle nøkkeltall →» at the foot of the card. The
          tap target runs into the card's bottom padding. */}
      <SmartLink
        href="/admin/nokkeltall"
        className="-mb-3 inline-flex min-h-[44px] items-center gap-1.5 self-start text-[13px] font-semibold text-on-strong"
      >
        {t('allMetrics')}
        <span aria-hidden className="font-[system-ui]">
          →
        </span>
      </SmartLink>
    </section>
  );
}

const WIDTH = 112;
const HEIGHT = 44;
const TOP = 8;
const SPAN = 24;

/**
 * The curve over the last weeks, as drawn: 14 px between the weeks, the
 * current week pushed out to x = 108 with a linen dot, and the values scaled
 * between y = 8 (highest) and y = 32 (lowest). A flat run sits mid-way.
 */
function TrendCurve({ values, label }: { values: readonly number[]; label: string }) {
  const max = Math.max(...values);
  const min = Math.min(...values);
  const points = values.map((v, i) => {
    const x = i === values.length - 1 ? 108 : 4 + 14 * i;
    const y = max === min ? TOP + SPAN / 2 : TOP + ((max - v) / (max - min)) * SPAN;
    return [x, y] as const;
  });
  const last = points.at(-1);
  return (
    <svg
      width={WIDTH}
      height={HEIGHT}
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      role="img"
      aria-label={label}
      className="shrink-0"
    >
      <polyline
        points={points.map(([x, y]) => `${x},${y}`).join(' ')}
        fill="none"
        stroke="var(--live-dot-on-strong)"
        strokeWidth={2.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {last && <circle cx={last[0]} cy={last[1]} r={3.5} fill="var(--on-strong)" />}
    </svg>
  );
}
