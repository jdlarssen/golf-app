import { useTranslations } from 'next-intl';
import { Card } from '@/components/ui/Card';
import { osloIsoWeek } from '@/lib/format/osloCalendar';

// Presentational view for the «Nøkkeltall» card (#1010). Pure (data injected
// as props, sync `useTranslations`) so the data-fetching shell in
// KeyMetricsCard.tsx stays thin and this renders in unit tests without a
// Supabase mock — the PlayerKlubbhus split.

export type KeyMetrics = {
  /** Users with ≥1 finished game. */
  usersGe1: number;
  /** Users with ≥2 finished games — the epic's activation signal. */
  usersGe2: number;
  /** Crews (exact non-withdrawn player sets) with ≥2 finished games. */
  gjengerGe2: number;
  /** Signups attributed to a public surface (landing page / poster) — #1022. */
  publicSignups: number;
  /** Finished games per Oslo week, oldest first, current week last. */
  weeks: { weekStart: string; finished: number }[];
};

/**
 * ISO week number of an Oslo week-start date (`YYYY-MM-DD`, always a Monday).
 * Anchored at noon UTC, which is mid-day in Oslo under both CET and CEST, so
 * the Oslo-local date is that same Monday regardless of DST.
 */
function weekNumber(weekStart: string): number {
  return osloIsoWeek(new Date(`${weekStart}T12:00:00Z`));
}

export function KeyMetricsView({ metrics }: { metrics: KeyMetrics }) {
  const t = useTranslations('admin.dashboard');
  const share =
    metrics.usersGe1 > 0
      ? Math.round((metrics.usersGe2 / metrics.usersGe1) * 100)
      : null;

  return (
    <section className="mt-6" data-testid="key-metrics">
      <p className="mb-1.5 px-1 font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
        {t('keyMetricsLabel')}
      </p>
      <Card className="p-4 sm:p-5">
        <dl className="space-y-3">
          <div>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="font-sans text-[13px] text-text">
                {t('keyMetricsPlayersTwoPlus')}
              </dt>
              <dd
                className="font-serif text-lg font-medium tabular-nums text-text"
                data-testid="key-metrics-users-ge2"
              >
                {metrics.usersGe2}
              </dd>
            </div>
            {share !== null && (
              <p
                className="mt-0.5 font-sans text-xs tabular-nums text-muted"
                data-testid="key-metrics-users-share"
              >
                {t('keyMetricsPlayersShare', {
                  share,
                  total: metrics.usersGe1,
                })}
              </p>
            )}
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <dt className="font-sans text-[13px] text-text">
              {t('keyMetricsCrewsTwoPlus')}
            </dt>
            <dd
              className="font-serif text-lg font-medium tabular-nums text-text"
              data-testid="key-metrics-gjenger-ge2"
            >
              {metrics.gjengerGe2}
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <dt className="font-sans text-[13px] text-text">
              {t('keyMetricsPublicSignups')}
            </dt>
            <dd
              className="font-serif text-lg font-medium tabular-nums text-text"
              data-testid="key-metrics-public-signups"
            >
              {metrics.publicSignups}
            </dd>
          </div>
        </dl>

        <div className="mt-4 border-t border-border pt-3">
          <p className="font-sans text-[13px] text-text">
            {t('keyMetricsTrendLabel')}
          </p>
          <div className="mt-2 grid grid-cols-8 gap-1 text-center">
            {metrics.weeks.map((w) => (
              <div key={w.weekStart} data-testid="key-metrics-week">
                <p className="font-sans text-[10px] text-muted">
                  {t('keyMetricsWeekAbbr', { week: weekNumber(w.weekStart) })}
                </p>
                <p className="font-serif text-sm font-medium tabular-nums text-text">
                  {w.finished}
                </p>
              </div>
            ))}
          </div>
        </div>
      </Card>
    </section>
  );
}
