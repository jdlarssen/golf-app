import { Suspense } from 'react';
import { getTranslations } from 'next-intl/server';
import { AdminShell } from '@/components/ui/AdminShell';
import { TopBar } from '@/components/ui/TopBar';
import { requireAdmin } from '@/lib/admin/auth';
import { getAdminContext } from '../_dashboardContext';
import { KeyMetricsCard } from '../KeyMetricsCard';

// «Nøkkeltall» (#1010) on its own page behind the week card's «Alle
// nøkkeltall →» (#2345): everything the dashboard's card showed, unchanged.
export default async function NokkeltallPage() {
  const { supabase } = await getAdminContext();
  await requireAdmin(supabase);
  const t = await getTranslations('admin.dashboard');

  return (
    <AdminShell>
      <TopBar backHref="/admin" kicker={t('keyMetricsLabel')} kickerIsPageTitle />
      <Suspense fallback={null}>
        <KeyMetricsCard />
      </Suspense>
    </AdminShell>
  );
}
