import { getTranslations } from 'next-intl/server';
import { AdminShell } from '@/components/ui/AdminShell';
import { TopBar } from '@/components/ui/TopBar';
import { requireAdmin } from '@/lib/admin/auth';
import { getAdminContext } from '../_dashboardContext';
import { DenseTileList, type Tile } from '../TilesView';

// «Cuper og ligaer» (#2345): the door from the morning report to the two
// rooms, with the counts their tiles showed on the old dashboard.
export default async function CupOgLigaPage() {
  const { supabase } = await getAdminContext();
  await requireAdmin(supabase);
  const [t, tMorning] = await Promise.all([
    getTranslations('admin.dashboard'),
    getTranslations('admin.dashboard.morning'),
  ]);

  const [activeCupsRes, activeLeaguesRes] = await Promise.all([
    supabase
      .from('tournaments')
      .select('id', { count: 'exact', head: true })
      .in('status', ['draft', 'active']),
    supabase
      .from('leagues')
      .select('id', { count: 'exact', head: true })
      .in('status', ['draft', 'active']),
  ]);
  const activeCupCount = activeCupsRes.count ?? 0;
  const activeLeagueCount = activeLeaguesRes.count ?? 0;

  const tiles: Tile[] = [
    {
      label: t('tilesCuper'),
      href: '/admin/cup',
      meta:
        activeCupCount === 0
          ? t('metaNoneActive')
          : t('metaActive', { n: activeCupCount }),
      icon: 'pokal',
    },
    {
      label: t('tilesLigaer'),
      href: '/admin/liga',
      meta:
        activeLeagueCount === 0
          ? t('metaNoneActive')
          : t('metaActive', { n: activeLeagueCount }),
      icon: 'pokal',
    },
  ];

  return (
    <AdminShell>
      <TopBar backHref="/admin" kicker={tMorning('cupsLeaguesTitle')} kickerIsPageTitle />
      <DenseTileList tiles={tiles} />
    </AdminShell>
  );
}
