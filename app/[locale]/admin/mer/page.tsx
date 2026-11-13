import { getLocale, getTranslations } from 'next-intl/server';
import { AdminShell } from '@/components/ui/AdminShell';
import { TopBar } from '@/components/ui/TopBar';
import { requireAdmin } from '@/lib/admin/auth';
import { formatShortOsloDayMonthLocale } from '@/lib/i18n/format';
import { withKlubbhusOrigin } from '@/lib/url/klubbhusOrigin';
import type { AppLocale } from '@/i18n/routing';
import { getAdminContext } from '../_dashboardContext';
import { DenseTileList, type Tile } from '../TilesView';

// «Mer …» (#2345): the rest of the Sekretariat's rooms behind one door on the
// morning report, with the lines their tiles showed on the old dashboard.
export default async function MerPage() {
  const { supabase } = await getAdminContext();
  await requireAdmin(supabase);
  const [t, tMorning, locale] = await Promise.all([
    getTranslations('admin.dashboard'),
    getTranslations('admin.dashboard.morning'),
    getLocale(),
  ]);

  const [lastPublishedRes, unbuiltIdeasRes] = await Promise.all([
    supabase
      .from('product_updates')
      .select('created_at')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    // #984: count of unbuilt idea submissions.
    supabase
      .from('idea_submissions')
      .select('id', { count: 'exact', head: true })
      .is('status', null),
  ]);
  const lastPublishedAt = (
    lastPublishedRes.data as { created_at: string | null } | null
  )?.created_at;
  const unbuiltIdeasCount = unbuiltIdeasRes.count ?? 0;

  const tiles: Tile[] = [
    // #50: klubber — admin governance (opprett og styr klubber).
    {
      label: t('tilesKlubber'),
      href: '/admin/klubber',
      meta: t('metaKlubber'),
      icon: 'laurbaer',
    },
    {
      label: t('tilesLanseringer'),
      href: '/admin/lanseringer',
      meta: lastPublishedAt
        ? t('metaLastPublished', { date: formatShortOsloDayMonthLocale(lastPublishedAt, locale as AppLocale) })
        : t('metaNonePublished'),
      icon: 'kalender',
    },
    // F3 (#273): admin format mapping; mappings and the active flag are set
    // there (#2337).
    {
      label: t('tilesFormats'),
      href: '/admin/formats',
      meta: t('metaFormats'),
      icon: 'formats',
    },
    // #500: oppslagsverket. Merket sender tilbake-pila til Klubbhuset (#2487).
    {
      label: t('tilesSpillformater'),
      href: withKlubbhusOrigin('/spillformater'),
      meta: t('metaSpillformater'),
      icon: 'spillformater',
    },
    // #984/#1560: innsendte ideer, with the unseen count in words.
    {
      label: t('tilesIdeer'),
      href: '/admin/ideer',
      meta:
        unbuiltIdeasCount === 0
          ? t('metaIdeerNone')
          : t('metaIdeer', { n: unbuiltIdeasCount }),
      icon: 'konvolutt',
    },
  ];

  return (
    <AdminShell>
      <TopBar backHref="/admin" kicker={tMorning('moreTitle')} kickerIsPageTitle />
      <DenseTileList tiles={tiles} />
    </AdminShell>
  );
}
