import { useTranslations } from 'next-intl';
import { MorningRow, MoreRows, RowArrow, RowCard } from './parts';

/** Rows shown before «Vis {n} til». */
const VISIBLE = 5;

export type NeedsYouListRow = {
  key: string;
  href: string;
  name: string;
  line?: string;
  /** Amber dot (cards not handed in); green otherwise. */
  warning: boolean;
  testId: string;
};

/**
 * «Trenger deg»'s card (#2345): the first five rows in the order given
 * (undelivered games first, then approvals, then the ideas), the rest behind
 * «Vis {n} til», so the report reads at a glance with a long queue too. The
 * section's heading keeps the full count. Presentation only.
 */
export function NeedsYouList({ rows }: { rows: readonly NeedsYouListRow[] }) {
  const t = useTranslations('admin.dashboard.morning');
  const row = (r: NeedsYouListRow) => (
    <MorningRow
      key={r.key}
      href={r.href}
      testId={r.testId}
      minHeight="min-h-[56px]"
      lead={<Dot warning={r.warning} />}
      name={r.name}
      line={r.line}
      trail={<RowArrow />}
    />
  );
  const rest = rows.slice(VISIBLE);
  return (
    <RowCard
      more={
        rest.length > 0 && (
          <MoreRows
            testId="morning-needs-you-more"
            count={rest.length}
            showLabel={t('needsYouMore', { count: rest.length })}
            hideLabel={t('needsYouFewer')}
          >
            {rest.map(row)}
          </MoreRows>
        )
      }
    >
      {rows.slice(0, VISIBLE).map(row)}
    </RowCard>
  );
}

/** Amber for cards not handed in, green for everything else. */
function Dot({ warning }: { warning: boolean }) {
  return (
    <span
      aria-hidden
      className={`h-2.5 w-2.5 shrink-0 rounded-full ${warning ? 'bg-warning' : 'bg-primary'}`}
    />
  );
}
