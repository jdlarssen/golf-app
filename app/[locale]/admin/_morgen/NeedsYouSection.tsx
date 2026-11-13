import { getTranslations } from 'next-intl/server';
import { SectionError } from '@/components/ui/SectionError';
import { getActiveRoundsDelivery, needsYouRows, type NeedsYouRow } from '@/lib/admin/actionItems';
import { getAdminContext } from '../_dashboardContext';
import { MorningSection } from './parts';
import { NeedsYouList, type NeedsYouListRow } from './NeedsYouList';

/**
 * «Trenger deg · n» (#2345): one row per active game with a card not handed
 * in or waiting for approval, plus the players' unseen ideas. Each row opens
 * the place to act; past five, the rest fold behind «Vis n til». Renders
 * nothing when nothing waits.
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
  if (games.length === 0 && ideas === 0) return null;

  const line = (row: NeedsYouRow) =>
    row.notDelivered > 0
      ? t('needsYouNotDelivered', { n: row.notDelivered })
      : row.allDelivered
        ? t('needsYouAllDelivered')
        : t('needsYouPendingApproval', { n: row.pendingApproval });

  const rows: NeedsYouListRow[] = games.map((row) => ({
    key: row.gameId,
    href: `/admin/games/${row.gameId}/status`,
    name: row.name,
    line: line(row),
    warning: row.notDelivered > 0,
    testId: 'morning-needs-you-row',
  }));
  if (ideas > 0) {
    rows.push({
      key: 'ideas',
      href: '/admin/ideer',
      name: t('needsYouIdeas', { n: ideas }),
      warning: false,
      testId: 'morning-needs-you-ideas',
    });
  }

  return (
    <MorningSection id="morning-needs-you" heading={t('needsYouHeading', { count: rows.length })}>
      <NeedsYouList rows={rows} />
    </MorningSection>
  );
}
