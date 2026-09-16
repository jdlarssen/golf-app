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
  /**
   * Onboarding funnel (#1192): distinct invited emails per step, all-time.
   * Steps 4–5 match invitees to active non-guest users by email, so they are
   * not guaranteed monotone against steps 1–3 (signup under another email).
   */
  funnel: {
    invited: number;
    opened: number;
    accepted: number;
    profileCompleted: number;
    firstScore: number;
  };
  /**
   * Livstegn (#2119) per Oslo month (`YYYY-MM`), oldest first, current month
   * last — twelve rows, empty months included. `byOthers` = not created by an
   * admin; `withoutAdmin` = also no non-withdrawn admin player.
   */
  months: {
    month: string;
    finished: number;
    byOthers: number;
    withoutAdmin: number;
  }[];
  /** The same three counts over all time. */
  livstegnTotal: { finished: number; byOthers: number; withoutAdmin: number };
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
        <LivstegnSection
          months={metrics.months}
          total={metrics.livstegnTotal}
        />

        <dl className="mt-4 space-y-3 border-t border-border pt-3">
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

        <FunnelSection funnel={metrics.funnel} />
      </Card>
    </section>
  );
}

/**
 * Onboarding drop-off (#1192): the five funnel steps as aggregate counts, with
 * each later step's share of the invited cohort (derived here, like `share`
 * above). Aggregates only — never a name or an email.
 */
function FunnelSection({ funnel }: { funnel: KeyMetrics['funnel'] }) {
  const t = useTranslations('admin.dashboard');
  const steps = [
    { id: 'invited', label: t('keyMetricsFunnelInvited'), value: funnel.invited },
    { id: 'opened', label: t('keyMetricsFunnelOpened'), value: funnel.opened },
    {
      id: 'accepted',
      label: t('keyMetricsFunnelAccepted'),
      value: funnel.accepted,
    },
    {
      id: 'profile-completed',
      label: t('keyMetricsFunnelProfile'),
      value: funnel.profileCompleted,
    },
    {
      id: 'first-score',
      label: t('keyMetricsFunnelFirstScore'),
      value: funnel.firstScore,
    },
  ];

  return (
    <div className="mt-4 border-t border-border pt-3">
      <p className="font-sans text-[13px] text-text">
        {t('keyMetricsFunnelLabel')}
      </p>
      <dl className="mt-2 space-y-1.5">
        {steps.map((step, i) => {
          const share =
            i > 0 && funnel.invited > 0
              ? Math.round((step.value / funnel.invited) * 100)
              : null;
          return (
            <div
              key={step.id}
              className="flex items-baseline justify-between gap-3"
            >
              <dt className="font-sans text-[13px] text-text">{step.label}</dt>
              <dd className="flex items-baseline gap-2">
                {share !== null && (
                  <span
                    className="font-sans text-xs tabular-nums text-muted"
                    data-testid={`key-metrics-funnel-${step.id}-share`}
                  >
                    {t('keyMetricsFunnelShare', { share })}
                  </span>
                )}
                <span
                  className="font-serif text-sm font-medium tabular-nums text-text"
                  data-testid={`key-metrics-funnel-${step.id}`}
                >
                  {step.value}
                </span>
              </dd>
            </div>
          );
        })}
      </dl>
    </div>
  );
}

/**
 * Livstegn (#2119, docs/visjon.md §Livstegn): finished games per Oslo month,
 * split into «by others» and «without Jørgen», newest month on top, with the
 * all-time total underneath. The month label is parsed from the `YYYY-MM`
 * string itself (no Date, so no timezone can shift it) and carries the year
 * on the top row and wherever the year changes.
 */
function LivstegnSection({
  months,
  total,
}: {
  months: KeyMetrics['months'];
  total: KeyMetrics['livstegnTotal'];
}) {
  const t = useTranslations('admin.dashboard');
  const rows = [...months].reverse();
  const cell = 'text-right font-serif text-sm font-medium tabular-nums text-text';
  const head = 'pb-1 font-sans text-[10px] font-normal text-muted';

  return (
    <div data-testid="key-metrics-livstegn">
      <p className="font-sans text-[13px] text-text">
        {t('keyMetricsLivstegnLabel')}
      </p>
      <table className="mt-2 w-full border-collapse">
        <thead>
          <tr>
            <th scope="col" className={`${head} text-left`}>
              {t('keyMetricsLivstegnMonth')}
            </th>
            <th scope="col" className={`${head} text-right`}>
              {t('keyMetricsLivstegnFinished')}
            </th>
            <th scope="col" className={`${head} text-right`}>
              {t('keyMetricsLivstegnByOthers')}
            </th>
            <th scope="col" className={`${head} text-right`}>
              {t('keyMetricsLivstegnWithoutAdmin')}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const [year, month] = row.month.split('-');
            const showYear = i === 0 || rows[i - 1].month.slice(0, 4) !== year;
            return (
              <tr
                key={row.month}
                data-testid="key-metrics-livstegn-month"
                data-month={row.month}
              >
                <th
                  scope="row"
                  className="py-1 text-left font-sans text-[13px] font-normal text-text"
                >
                  {t('keyMetricsLivstegnMonthName', { month: Number(month) })}
                  {showYear && (
                    <span className="tabular-nums text-muted"> {year}</span>
                  )}
                </th>
                <td className={`${cell} py-1`}>{row.finished}</td>
                <td className={`${cell} py-1`}>{row.byOthers}</td>
                <td className={`${cell} py-1`}>{row.withoutAdmin}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t border-border">
            <th
              scope="row"
              className="pt-1.5 text-left font-sans text-[13px] font-semibold text-text"
            >
              {t('keyMetricsLivstegnTotal')}
            </th>
            <td
              className={`${cell} pt-1.5`}
              data-testid="key-metrics-livstegn-total-finished"
            >
              {total.finished}
            </td>
            <td
              className={`${cell} pt-1.5`}
              data-testid="key-metrics-livstegn-total-by-others"
            >
              {total.byOthers}
            </td>
            <td
              className={`${cell} pt-1.5`}
              data-testid="key-metrics-livstegn-total-without-admin"
            >
              {total.withoutAdmin}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
