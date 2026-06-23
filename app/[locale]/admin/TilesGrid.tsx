import { getTranslations, getLocale } from 'next-intl/server';
import { SmartLink } from '@/components/ui/SmartLink';
import { AdminShell } from '@/components/ui/AdminShell';
import { TopBar } from '@/components/ui/TopBar';
import { ClubStamp } from '@/components/ui/ClubStamp';
import { PullQuote } from '@/components/ui/PullQuote';
import { Skeleton } from '@/components/ui/Skeleton';
import {
  BaneIcon,
  FlaggIcon,
  FormatsIcon,
  KonvoluttIcon,
  LaurbaerIcon,
  PokalIcon,
  ScorekortIcon,
  SparkleIcon,
} from '@/components/icons';
import { firstName } from '@/lib/firstName';
import { formatShortOsloDayMonthLocale } from '@/lib/i18n/format';
import type { AppLocale } from '@/i18n/routing';
import { type AdminRoleContext } from '@/lib/admin/auth';
import { getActionItemCounts, totalActionableGames } from '@/lib/admin/actionItems';
import { getAdminContext } from './_dashboardContext';

// ─── Tile grid ───────────────────────────────────────────────────────────

export type TileIconKind = 'flagg' | 'konvolutt' | 'bane' | 'pokal' | 'sparkle' | 'formats' | 'laurbaer' | 'spillformater';
export type Tile = {
  label: string;
  href: string;
  meta: string;
  icon: TileIconKind;
  accent?: boolean;
  /** Optional count surfaced as a champagne pill top-right (capped «9+»). */
  badge?: number;
};

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

/**
 * Presentational tile grid — shared by the admin dashboard (TilesGrid) and the
 * regular-player Klubbhuset view (PlayerKlubbhus) so both render identical
 * card chrome. The `accent` tile gets the champagne-on-forest treatment.
 */
export function TileGridView({ tiles }: { tiles: Tile[] }) {
  return (
    <div className="mb-2 grid grid-cols-2 gap-2.5">
      {tiles.map((tile, i) => (
        <SmartLink
          key={tile.label}
          href={tile.href}
          className="reveal-up relative min-h-[108px] rounded-2xl px-3.5 pt-3.5 pb-3 text-left transition-opacity duration-100 hover:opacity-95 active:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
          style={{
            animationDelay: `${60 + i * 70}ms`,
            background: tile.accent ? 'var(--surface-strong)' : 'var(--surface)',
            color: tile.accent ? 'var(--bg-tint)' : 'var(--text)',
            border: tile.accent ? 'none' : '1px solid var(--border)',
            boxShadow: tile.accent
              ? '0 4px 14px rgba(26, 46, 31, 0.15)'
              : '0 1px 2px rgba(26, 46, 31, 0.03)',
          }}
        >
          {tile.badge ? <TileBadge count={tile.badge} /> : null}
          <div
            className="mb-2.5 flex h-9 w-9 items-center justify-center rounded-[9px]"
            style={{
              background: tile.accent
                ? 'rgba(201, 169, 97, 0.20)'
                : 'var(--admin-bg)',
              color: tile.accent ? 'var(--accent)' : 'var(--primary)',
            }}
          >
            <TileIcon kind={tile.icon} />
          </div>
          <p className="font-serif text-base font-medium tracking-[-0.005em]">
            {tile.label}
          </p>
          <p
            className="mt-0.5 font-sans text-[11px] tabular-nums"
            style={{
              color: tile.accent
                ? 'rgba(240, 237, 229, 0.75)'
                : 'var(--text-muted)',
            }}
          >
            {tile.meta}
          </p>
        </SmartLink>
      ))}
    </div>
  );
}

/**
 * Compact tile grid — the «Mer i Sekretariatet»-section (#914). Same data
 * shape as TileGridView but a denser single-row layout (icon + label, meta
 * dropped) so the everyday core cards stay visually dominant. Tap target stays
 * ≥44px (min-h-[56px]); the champagne badge is supported here too.
 */
export function CompactTileGrid({ tiles }: { tiles: Tile[] }) {
  return (
    <div className="mb-2 grid grid-cols-2 gap-2.5">
      {tiles.map((tile, i) => (
        <SmartLink
          key={tile.label}
          href={tile.href}
          className="reveal-up relative flex min-h-[56px] items-center gap-2.5 rounded-xl border border-border bg-surface px-3 py-2.5 text-left text-text transition-opacity duration-100 hover:opacity-95 active:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
          style={{ animationDelay: `${60 + i * 70}ms` }}
        >
          {tile.badge ? <TileBadge count={tile.badge} /> : null}
          <span
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px]"
            style={{ background: 'var(--admin-bg)', color: 'var(--primary)' }}
          >
            <TileIcon kind={tile.icon} size={18} />
          </span>
          <span className="font-serif text-sm font-medium tracking-[-0.005em]">
            {tile.label}
          </span>
        </SmartLink>
      ))}
    </div>
  );
}

/**
 * Champagne count pill, top-right of a tile (#914). Reuses the BottomNav-dot
 * treatment — accent fill, page-bg border to lift it off the card — but carries
 * a number with `tabular-nums`, capped at «9+». Decorative: the count is also
 * conveyed by the tile meta / «Krever handling»-stripa, so it's aria-hidden.
 */
function TileBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span
      aria-hidden
      data-testid="tile-badge"
      className="absolute right-2.5 top-2.5 flex h-5 min-w-[20px] items-center justify-center rounded-full border-2 border-bg px-1 font-sans text-[11px] font-semibold tabular-nums"
      style={{ background: 'var(--accent)', color: 'var(--primary)' }}
    >
      {count > 9 ? '9+' : count}
    </span>
  );
}

/**
 * Regular-player (and trusted-creator) view of the universal Klubbhuset room
 * (#392). No admin counts, no activity ledger — just the two surfaces a
 * non-admin owns: the games they arrange (Spill → /klubbhuset) and adding a
 * course (Baner). Trusted creators reach the full course catalog; regular
 * players get the create-only door (#366 gave them create, not edit).
 */
export async function PlayerKlubbhus({ role }: { role: AdminRoleContext }) {
  const t = await getTranslations('admin.dashboard');
  const tNav = await getTranslations('admin.nav');
  // Display name is already on the role context (lib/admin/auth.ts) — no need
  // for a second `users` round-trip. With this gone PlayerKlubbhus awaits no
  // data of its own and paints immediately.
  const firstNameValue = firstName(role.name);

  const banerTile: Tile = {
    label: t('playerBaner'),
    href: '/opprett-bane',
    meta: t('playerBanerMeta'),
    icon: 'bane',
  };

  const tiles: Tile[] = [
    {
      label: t('playerSpill'),
      href: '/klubbhuset',
      meta: t('playerSpillMeta'),
      icon: 'flagg',
      accent: true,
    },
    banerTile,
    // #442: klubber — opprett og styr klubber.
    {
      label: t('playerKlubber'),
      href: '/klubber',
      meta: t('playerKlubberMeta'),
      icon: 'laurbaer',
    },
    // #500: oppslagsverket — også for vanlige spillere, så de beholder browse-
    // tilgang til formatene når format-kortet fjernes fra Hjem.
    {
      label: t('playerSpillformater'),
      href: '/spillformater',
      meta: t('playerSpillformaterMeta'),
      icon: 'spillformater',
    },
  ];

  return (
    <AdminShell>
      <TopBar backHref="/" kicker={tNav('klubbhus')} />

      <section
        className="relative mb-4 overflow-hidden rounded-2xl border px-5 py-[18px]"
        style={{
          background:
            'linear-gradient(180deg, var(--admin-salutation-top) 0%, var(--admin-salutation-bottom) 100%)',
          borderColor: 'var(--admin-salutation-border)',
        }}
      >
        <p className="font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
          {t('klubbhusLabel')}
        </p>
        <h1 className="mt-1 font-serif text-[22px] font-medium leading-snug tracking-[-0.015em] text-text">
          {firstNameValue
            ? t('playerGreeting', { name: firstNameValue })
            : t('playerGreetingNoName')}
        </h1>
        <p className="mt-1.5 font-sans text-xs text-muted">
          {t('playerSubtitle')}
        </p>
        <ClubStamp className="absolute right-[14px] top-[14px]" />
      </section>

      <TileGridView tiles={tiles} />

      <PullQuote className="mt-6">
        {t('playerPullQuote')}
      </PullQuote>
    </AdminShell>
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
        {Array.from({ length: 6 }).map((_, i) => (
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

function TileIcon({ kind, size = 22 }: { kind: TileIconKind; size?: number }) {
  if (kind === 'flagg') return <FlaggIcon width={size} height={size} />;
  if (kind === 'konvolutt') return <KonvoluttIcon width={size} height={size} />;
  if (kind === 'bane') return <BaneIcon width={size} height={size} />;
  if (kind === 'sparkle') return <SparkleIcon width={size} height={size} />;
  if (kind === 'formats') return <FormatsIcon width={size} height={size} />;
  if (kind === 'laurbaer') return <LaurbaerIcon width={size} height={size} />;
  if (kind === 'spillformater') return <ScorekortIcon width={size} height={size} />;
  return <PokalIcon width={size} height={size} />;
}

