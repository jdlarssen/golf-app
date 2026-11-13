import { getTranslations } from 'next-intl/server';
import { AppShell } from '@/components/ui/AppShell';
import { TopBar } from '@/components/ui/TopBar';
import { PageHeader } from '@/components/ui/PageHeader';
import { Skeleton } from '@/components/ui/Skeleton';

/**
 * Loading skeleton for /klubber/[id]/administrer (#2326): the page's own title over a few
 * card-shaped rows, instead of the root's Hjem skeleton.
 */
export default async function KlubbAdministrerLoading() {
  const t = await getTranslations('klubb.room');
  return (
    <AppShell>
      <TopBar />
      <PageHeader title={t('manageDoor')} />
      <div className="space-y-2" aria-hidden>
        <Skeleton className="h-[72px] rounded-2xl" />
        <Skeleton className="h-[72px] rounded-2xl" delay={60} />
        <Skeleton className="h-[72px] rounded-2xl" delay={120} />
      </div>
    </AppShell>
  );
}
