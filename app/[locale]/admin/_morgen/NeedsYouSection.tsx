import { getTranslations } from 'next-intl/server';
import { SectionError } from '@/components/ui/SectionError';
import { getActiveRoundsDelivery, needsYouRows, type NeedsYouRow } from '@/lib/admin/actionItems';
import { getAdminContext } from '../_dashboardContext';
import { MorningRow, MorningSection, RowArrow, RowCard } from './parts';

/**
 * «Trenger deg · n» (#2345): one row per active game with a card not handed
 * in or waiting for approval, plus the players' unseen ideas. Each row opens
 * the place to act. Renders nothing when nothing waits.
 */
export async function NeedsYouSection() {
  const { supabase } = await getAdminContext();
  const t = await getTranslations('admin.dashboard.morning');
  const [delivery, ideasRes] = await Promise.all([
    getActiveRoundsDelivery(),
    // #984: unseen idea submissions, the count the ideas door showed.
    supabase
      .from('idea_submissions')
      .select('id', { count: 'exact', head: true })
      .is('status', null),
  ]);

  if (!delivery || ideasRes.error) {
    if (ideasRes.error) console.error('[admin/morning] idea_submissions', ideasRes.error);
    return (
      <div className="-mx-1 mt-4">
        <SectionError testId="morning-needs-you-error" />
      </div>
    );
  }

  const games = needsYouRows(delivery.games, delivery.players);
  const ideas = ideasRes.count ?? 0;
  const count = games.length + (ideas > 0 ? 1 : 0);
  if (count === 0) return null;

  const line = (row: NeedsYouRow) =>
    row.notDelivered > 0
      ? t('needsYouNotDelivered', { n: row.notDelivered })
      : row.allDelivered
        ? t('needsYouAllDelivered')
        : t('needsYouPendingApproval', { n: row.pendingApproval });

  return (
    <MorningSection id="morning-needs-you" heading={t('needsYouHeading', { count })}>
      <RowCard>
        {games.map((row) => (
          <MorningRow
            key={row.gameId}
            href={`/admin/games/${row.gameId}/status`}
            testId="morning-needs-you-row"
            minHeight="min-h-[56px]"
            lead={<Dot warning={row.notDelivered > 0} />}
            name={row.name}
            line={line(row)}
            trail={<RowArrow />}
          />
        ))}
        {ideas > 0 && (
          <MorningRow
            href="/admin/ideer"
            testId="morning-needs-you-ideas"
            minHeight="min-h-[56px]"
            lead={<Dot warning={false} />}
            name={t('needsYouIdeas', { n: ideas })}
            trail={<RowArrow />}
          />
        )}
      </RowCard>
    </MorningSection>
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
