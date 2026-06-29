import { getTranslations, getLocale } from 'next-intl/server';
import { Skeleton } from '@/components/ui/Skeleton';
import { formatShortOsloDayMonthLocale } from '@/lib/i18n/format';
import type { AppLocale } from '@/i18n/routing';
import { getActionItemCounts, totalActionableGames } from '@/lib/admin/actionItems';
import { getAdminContext } from './_dashboardContext';
import { TileGridView, CompactTileGrid, type Tile } from './TilesView';

// ─── Admin dashboard tile grid (data-fetching) ─────────────────────────────

export async function TilesGrid() {
  // Admin-only: the page branches non-admins to PlayerKlubbhus before reaching
  // here, so these counts (all games / all users / all courses) only ever run
  // for an admin.
  const { supabase } = await getAdminContext();
  const t = await getTranslations('admin.dashboard');
  const locale = await getLocale();
  const now = new Date();

  const [
    activeGamesRes,
    plannedGamesRes,
    pendingInvitesRes,
    usersRes,
    coursesRes,
    lastFinishedRes,
    lastPublishedRes,
    activeCupsRes,
    activeLeaguesRes,
    actionCounts,
    unbuiltIdeasRes,
  ] = await Promise.all([
    supabase
      .from('games')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'active'),
    supabase
      .from('games')
      .select('id', { count: 'exact', head: true })
      .in('status', ['draft', 'scheduled']),
    supabase
      .from('invitations')
      .select('id', { count: 'exact', head: true })
      .is('accepted_at', null)
      .gt('expires_at', now.toISOString()),
    supabase.from('users').select('id', { count: 'exact', head: true }),
    supabase.from('courses').select('id', { count: 'exact', head: true }),
    supabase
      .from('games')
      .select('ended_at')
      .eq('status', 'finished')
      .order('ended_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('product_updates')
      .select('created_at')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('tournaments')
      .select('id', { count: 'exact', head: true })
      .in('status', ['draft', 'active']),
    supabase
      .from('leagues')
      .select('id', { count: 'exact', head: true })
      .in('status', ['draft', 'active']),
    // #914: Spill-tile badge. cache()-delt med «Krever handling»-stripa (#864),
    // så dette er samme query-runde — ikke en ekstra round-trip.
    getActionItemCounts(),
    // #984: count of unbuilt idea submissions for the admin badge.
    supabase
      .from('idea_submissions')
      .select('id', { count: 'exact', head: true })
      .is('status', null),
  ]);

  const activeCount = activeGamesRes.count ?? 0;
  const plannedCount = plannedGamesRes.count ?? 0;
  const pendingInvites = pendingInvitesRes.count ?? 0;
  const userCount = usersRes.count ?? 0;
  const courseCount = coursesRes.count ?? 0;
  const lastFinishedAt = (lastFinishedRes.data as { ended_at: string | null } | null)
    ?.ended_at;
  const lastPublishedAt = (
    lastPublishedRes.data as { created_at: string | null } | null
  )?.created_at;
  const activeCupCount = activeCupsRes.count ?? 0;
  const activeLeagueCount = activeLeaguesRes.count ?? 0;
  const actionableGames = totalActionableGames(actionCounts);
  const unbuiltIdeasCount = unbuiltIdeasRes.count ?? 0;

  // #914: tier the wall — the everyday core loop keeps full cards; the rest
  // moves to a denser «Mer i Sekretariatet»-section below. Everything stays
  // visible (one door per room — no door is hidden).
  const coreTiles: Tile[] = [
    {
      label: t('tilesSpill'),
      href: '/admin/games',
      meta: t('metaActiveAndPlanned', { active: activeCount, planned: plannedCount }),
      icon: 'flagg',
      accent: true,
      badge: actionableGames,
    },
    {
      label: t('tilesSpillere'),
      href: '/admin/spillere',
      meta:
        userCount === 0
          ? t('metaNoneRegistered')
          : pendingInvites > 0
            ? t('metaRegisteredPending', { n: userCount, pending: pendingInvites })
            : t('metaRegistered', { n: userCount }),
      icon: 'konvolutt',
      badge: pendingInvites,
    },
    {
      label: t('tilesBaner'),
      href: '/admin/courses',
      meta:
        courseCount === 0
          ? t('metaNoneRegistered')
          : t('metaRegistered', { n: courseCount }),
      icon: 'bane',
    },
    {
      label: t('tilesProtokoll'),
      href: '/admin/games?status=finished',
      meta: lastFinishedAt
        ? t('metaLastSigned', { date: formatShortOsloDayMonthLocale(lastFinishedAt, locale as AppLocale) })
        : t('metaNoneSigned'),
      icon: 'pokal',
    },
  ];

  const moreTiles: Tile[] = [
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
    {
      label: t('tilesLanseringer'),
      href: '/admin/lanseringer',
      meta: lastPublishedAt
        ? t('metaLastPublished', { date: formatShortOsloDayMonthLocale(lastPublishedAt, locale as AppLocale) })
        : t('metaNonePublished'),
      icon: 'sparkle',
    },
    // #50: klubber — admin governance (opprett og styr klubber).
    {
      label: t('tilesKlubber'),
      href: '/admin/klubber',
      meta: t('metaKlubber'),
      icon: 'laurbaer',
    },
    // F3 (#273): admin format-mapping. Mappings + cup-eligibility +
    // active-flagg styres herfra. Meta er statisk (vi har ingen tellbar
    // KPI per d.d. — kan utvides hvis vi vil vise antall aktive formats).
    {
      label: t('tilesFormats'),
      href: '/admin/formats',
      meta: t('metaFormats'),
      icon: 'formats',
    },
    // #500: oppslagsverket — et rolig sted å lese om formatene (flyttet hit fra
    // Hjem; den raske «slik funker det» bor bak «?» i veiviseren).
    {
      label: t('tilesSpillformater'),
      href: '/spillformater',
      meta: t('metaSpillformater'),
      icon: 'spillformater',
    },
    // #984: innsendte ideer fra spillerne.
    {
      label: t('tilesIdeer'),
      href: '/admin/ideer',
      meta:
        unbuiltIdeasCount === 0
          ? t('metaIdeerNone')
          : t('metaIdeer', { n: unbuiltIdeasCount }),
      icon: 'sparkle',
      badge: unbuiltIdeasCount,
    },
  ];

  return (
    <>
      <TileGridView tiles={coreTiles} />
      <p className="mt-6 mb-1.5 px-1 font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
        {t('moreInSecretariat')}
      </p>
      <CompactTileGrid tiles={moreTiles} />
    </>
  );
}

export function TilesSkeleton() {
  // Lockstep with the tiered structure (#914): 4 full core cards, then the
  // «Mer i Sekretariatet»-label, then 6 compact cards.
  return (
    <>
      <div className="mb-2 grid grid-cols-2 gap-2.5">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="min-h-[108px] rounded-2xl border border-border bg-surface px-3.5 pt-3.5 pb-3"
          >
            <Skeleton className="mb-2.5 h-9 w-9 rounded-[9px]" delay={i * 90} />
            <Skeleton className="h-4 w-16" delay={i * 90 + 30} />
            <Skeleton className="mt-1.5 h-3 w-24" delay={i * 90 + 60} />
          </div>
        ))}
      </div>
      <Skeleton className="mt-6 mb-1.5 ml-1 h-3 w-32" delay={360} />
      <div className="mb-2 grid grid-cols-2 gap-2.5">
        {Array.from({ length: 7 }).map((_, i) => (
          <div
            key={i}
            className="flex min-h-[56px] items-center gap-2.5 rounded-xl border border-border bg-surface px-3 py-2.5"
          >
            <Skeleton className="h-8 w-8 shrink-0 rounded-[8px]" delay={i * 90} />
            <Skeleton className="h-3.5 w-20" delay={i * 90 + 30} />
          </div>
        ))}
      </div>
    </>
  );
}
